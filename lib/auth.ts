import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { supabaseAdmin } from "./supabaseAdmin";

// Erro usado para retornar 401/404 de forma padronizada nas rotas.
export class ApiAuthError extends Error {
  status: number;
  codigo: string;
  constructor(status: number, codigo: string, message: string) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

/**
 * Busca o tenant_id do usuário autenticado a partir da tabela `perfis`,
 * usando Prisma (conexão direta ao banco, sem passar por RLS).
 *
 * Reaproveitada tanto pela validação de Bearer token das API Routes
 * (getTenantFromRequest, abaixo) quanto por Server Components que já sabem
 * o id do usuário via cookies de sessão — ex.: app/dashboard/page.tsx, que
 * chama esta função diretamente para montar os indicadores do Dashboard
 * sem precisar de um token Bearer nem de uma ida e volta HTTP.
 */
export async function getTenantIdForUserId(userId: string): Promise<string> {
  const perfil = await prisma.perfil.findUnique({ where: { id: userId } });
  if (!perfil) {
    throw new ApiAuthError(
      404,
      "PERFIL_NAO_ENCONTRADO",
      "Usuário autenticado não tem perfil vinculado a nenhum tenant."
    );
  }
  return perfil.tenantId;
}

/**
 * Igual a getTenantIdForUserId, mas também devolve o papel do usuário
 * (Fase 1 do módulo Financeiro — controle de acesso). Usada por Server
 * Components (ex.: app/dashboard/layout.tsx, app/dashboard/usuarios) e
 * por API Routes que precisam checar se o chamador é "dono" antes de
 * permitir a ação (ex.: /api/usuarios/convidar).
 */
export async function getPerfilForUserId(
  userId: string
): Promise<{ tenantId: string; papel: string }> {
  const perfil = await prisma.perfil.findUnique({ where: { id: userId } });
  if (!perfil) {
    throw new ApiAuthError(
      404,
      "PERFIL_NAO_ENCONTRADO",
      "Usuário autenticado não tem perfil vinculado a nenhum tenant."
    );
  }
  return { tenantId: perfil.tenantId, papel: perfil.papel };
}

/**
 * Valida o token Bearer do Supabase Auth enviado pelo front-end e devolve
 * o tenant_id correspondente ao usuário logado.
 *
 * Decisão: a validação é feita chamando o próprio servidor de autenticação
 * do Supabase (auth.getUser), em vez de verificar a assinatura do token
 * localmente com um segredo fixo. Isso funciona independente de o projeto
 * usar o Legacy JWT Secret (HS256) ou as novas JWT Signing Keys
 * assimétricas (ECC) — o Supabase decide qual método usar, e a aplicação
 * não precisa saber disso nem guardar esse segredo.
 *
 * Decisão registrada na Documentação da API v1.0 (Seção "Convenções"):
 * o tenant_id NUNCA vem do corpo da requisição — é sempre derivado do
 * usuário autenticado no servidor, para impedir que alguém tente forjar
 * o tenant_id de outra empresa.
 */
export async function getTenantFromRequest(
  req: NextRequest
): Promise<{ userId: string; tenantId: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new ApiAuthError(401, "NAO_AUTENTICADO", "Token de autenticação ausente.");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new ApiAuthError(
      500,
      "CONFIGURACAO_AUSENTE",
      "SUPABASE_URL ou SUPABASE_SECRET_KEY não configurados no servidor."
    );
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiAuthError(401, "TOKEN_INVALIDO", "Token de autenticação inválido ou expirado.");
  }

  const userId = data.user.id;
  const tenantId = await getTenantIdForUserId(userId);

  return { userId, tenantId };
}
