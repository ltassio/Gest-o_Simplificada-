import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantFromRequest, getPerfilForUserId, ApiAuthError } from "@/lib/auth";
import { ehPapelValido } from "@/lib/permissoes";

// POST /api/usuarios/convidar
//
// Cria um novo usuário (Supabase Auth) e vincula ao mesmo tenant do
// chamador, com o papel informado. Só "dono" pode chamar esta rota —
// checado aqui no servidor (não só escondendo o botão na UI), porque é
// a única forma de criar um perfil: a tabela `perfis` não tem política
// de INSERT para o navegador (ver migration 004_financeiro_fase1.sql),
// só a service key (usada aqui via supabaseAdmin + Prisma) consegue.
//
// Não dependemos de e-mail transacional (SMTP) estar configurado no
// projeto Supabase: em vez de convite por e-mail, criamos a conta já
// com uma senha temporária e devolvemos essa senha na resposta, para o
// dono repassar à pessoa por fora (WhatsApp, etc). A pessoa pode trocar
// a senha depois pelo fluxo padrão de "esqueci minha senha" do Supabase.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getTenantFromRequest(req);
    const chamador = await getPerfilForUserId(userId);

    if (chamador.papel !== "dono") {
      return NextResponse.json(
        {
          erro: {
            codigo: "SEM_PERMISSAO",
            mensagem: "Só o dono da conta pode convidar ou gerenciar usuários.",
          },
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const email: string | undefined = body.email?.trim().toLowerCase();
    const nome: string | undefined = body.nome?.trim();
    const papel: string | undefined = body.papel;

    if (!email || !nome || !papel) {
      return NextResponse.json(
        { erro: { codigo: "PARAMETROS_INVALIDOS", mensagem: "Informe nome, e-mail e papel." } },
        { status: 400 }
      );
    }

    if (!ehPapelValido(papel)) {
      return NextResponse.json(
        {
          erro: {
            codigo: "PAPEL_INVALIDO",
            mensagem: "Papel deve ser 'dono', 'financeiro' ou 'operador'.",
          },
        },
        { status: 400 }
      );
    }

    const jaExiste = await prisma.perfil.findFirst({
      where: { tenantId: chamador.tenantId, email },
    });
    if (jaExiste) {
      return NextResponse.json(
        {
          erro: {
            codigo: "USUARIO_JA_EXISTE",
            mensagem: "Já existe um usuário com esse e-mail nesta empresa.",
          },
        },
        { status: 409 }
      );
    }

    const senhaTemporaria = gerarSenhaTemporaria();

    const { data: novoUsuario, error: erroCriacao } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
    });

    if (erroCriacao || !novoUsuario?.user) {
      return NextResponse.json(
        {
          erro: {
            codigo: "ERRO_AO_CRIAR_USUARIO",
            mensagem:
              erroCriacao?.message ??
              "Não foi possível criar o usuário (talvez o e-mail já esteja em uso em outra empresa).",
          },
        },
        { status: 422 }
      );
    }

    await prisma.perfil.create({
      data: {
        id: novoUsuario.user.id,
        tenantId: chamador.tenantId,
        nome,
        email,
        papel,
      },
    });

    return NextResponse.json({
      ok: true,
      usuario: { id: novoUsuario.user.id, nome, email, papel },
      senha_temporaria: senhaTemporaria,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em /api/usuarios/convidar:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao criar o usuário." } },
      { status: 500 }
    );
  }
}

function gerarSenhaTemporaria(): string {
  // 12 caracteres alfanuméricos, fáceis de digitar/ler em voz alta (sem
  // caracteres ambíguos como 0/O, 1/l/I).
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let senha = "";
  for (let i = 0; i < 12; i++) {
    senha += alfabeto[bytes[i] % alfabeto.length];
  }
  return senha;
}
