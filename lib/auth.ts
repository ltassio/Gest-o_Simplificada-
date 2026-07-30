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

  // Esta consulta usa o Prisma direto no Postgres (via DATABASE_URL), que
  // NÃO passa pela Row-Level Security. Por isso o tenant_id retornado aqui
  // é a única fonte de verdade usada para filtrar tudo que a rota fizer.
  const perfil = await prisma.perfil.findUnique({ where: { id: userId } });
  if (!perfil) {
    throw new ApiAuthError(404, "PERFIL_NAO_ENCONTRADO", "Usuário autenticado não tem perfil vinculado a nenhum tenant.");
  }

  return { userId, tenantId: perfil.tenantId };
}
