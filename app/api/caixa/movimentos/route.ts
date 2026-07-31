import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";

const TIPOS_VALIDOS = ["suprimento", "sangria", "despesa"];

// GET /api/caixa/movimentos — lista os movimentos da sessão de caixa aberta.
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);

    const sessao = await prisma.caixaSessao.findFirst({ where: { tenantId, status: "aberto" } });
    if (!sessao) {
      return NextResponse.json({ movimentos: [] });
    }

    const movimentos = await prisma.caixaMovimento.findMany({
      where: { tenantId, sessaoId: sessao.id },
      include: { formaPagamento: { select: { nome: true } } },
      orderBy: { dataMovimento: "desc" },
    });

    return NextResponse.json({
      movimentos: movimentos.map((m: any) => ({
        id: m.id,
        tipo: m.tipo,
        valor: Number(m.valor),
        descricao: m.descricao,
        forma_pagamento: m.formaPagamento?.nome ?? null,
        data_movimento: m.dataMovimento,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em GET /api/caixa/movimentos:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao listar os movimentos de caixa." } },
      { status: 500 }
    );
  }
}

// POST /api/caixa/movimentos
// Body: { tipo: "suprimento"|"sangria"|"despesa", valor: number, descricao?: string, forma_pagamento_id?: string }
// A sessão nunca vem do corpo da requisição — é sempre a sessão "aberto" do
// tenant no momento, pelo mesmo motivo que tenant_id nunca vem do corpo
// (evita adulteração: ver lib/auth.ts).
export async function POST(req: NextRequest) {
  try {
    const { userId, tenantId } = await getTenantFromRequest(req);
    const body = await req.json();

    const tipo: string | undefined = body.tipo;
    const valor = Number(body.valor);

    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json(
        {
          erro: {
            codigo: "PARAMETROS_INVALIDOS",
            mensagem: `tipo é obrigatório e precisa ser um de: ${TIPOS_VALIDOS.join(", ")}.`,
          },
        },
        { status: 400 }
      );
    }
    if (Number.isNaN(valor) || valor <= 0) {
      return NextResponse.json(
        { erro: { codigo: "VALOR_INVALIDO", mensagem: "valor precisa ser maior que zero." } },
        { status: 400 }
      );
    }

    const sessao = await prisma.caixaSessao.findFirst({ where: { tenantId, status: "aberto" } });
    if (!sessao) {
      return NextResponse.json(
        { erro: { codigo: "CAIXA_FECHADO", mensagem: "Abra o caixa antes de lançar um movimento." } },
        { status: 409 }
      );
    }

    let formaPagamentoId: string | null = null;
    if (body.forma_pagamento_id) {
      const forma = await prisma.formaPagamento.findFirst({
        where: { id: body.forma_pagamento_id, tenantId },
      });
      if (!forma) {
        return NextResponse.json(
          { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Forma de pagamento não encontrada." } },
          { status: 404 }
        );
      }
      formaPagamentoId = forma.id;
    }

    const movimento = await prisma.caixaMovimento.create({
      data: {
        tenantId,
        sessaoId: sessao.id,
        tipo,
        valor,
        descricao: body.descricao?.trim() || null,
        formaPagamentoId,
        criadoPorId: userId,
      },
    });

    return NextResponse.json(
      {
        id: movimento.id,
        tipo: movimento.tipo,
        valor: Number(movimento.valor),
        descricao: movimento.descricao,
        data_movimento: movimento.dataMovimento,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em POST /api/caixa/movimentos:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao registrar o movimento de caixa." } },
      { status: 500 }
    );
  }
}
