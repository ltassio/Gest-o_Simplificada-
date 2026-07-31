import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";
import { getResumoSessaoCaixa } from "@/lib/caixa";

// GET /api/caixa/sessoes?status=aberto
// Sem parâmetro "status", devolve a sessão aberta do tenant (ou null, se o
// caixa estiver fechado) já com o resumo (Documento de Visão do Produto —
// fluxo de Caixa como PDV, adicionado em 31/07/2026). Só pode existir 1
// sessão "aberto" por tenant por vez (garantido por índice único parcial
// no banco, migration 007).
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    if (status === "historico") {
      const sessoes = await prisma.caixaSessao.findMany({
        where: { tenantId, status: "fechado" },
        orderBy: { dataAbertura: "desc" },
        take: 30,
      });
      return NextResponse.json({ sessoes: sessoes.map(serializeSessao) });
    }

    const sessao = await prisma.caixaSessao.findFirst({
      where: { tenantId, status: "aberto" },
    });

    if (!sessao) {
      return NextResponse.json({ sessao: null, resumo: null });
    }

    const resumo = await getResumoSessaoCaixa(tenantId, sessao.id);
    return NextResponse.json({ sessao: serializeSessao(sessao), resumo });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em GET /api/caixa/sessoes:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao buscar a sessão de caixa." } },
      { status: 500 }
    );
  }
}

// POST /api/caixa/sessoes — abre uma nova sessão de caixa (o dia do PDV).
// Body: { valor_abertura?: number, observacao?: string }
export async function POST(req: NextRequest) {
  try {
    const { userId, tenantId } = await getTenantFromRequest(req);
    const body = await req.json();

    const valorAbertura = Number(body.valor_abertura ?? 0);
    if (Number.isNaN(valorAbertura) || valorAbertura < 0) {
      return NextResponse.json(
        { erro: { codigo: "VALOR_INVALIDO", mensagem: "valor_abertura precisa ser zero ou maior." } },
        { status: 400 }
      );
    }

    const jaAberta = await prisma.caixaSessao.findFirst({ where: { tenantId, status: "aberto" } });
    if (jaAberta) {
      return NextResponse.json(
        {
          erro: {
            codigo: "CAIXA_JA_ABERTO",
            mensagem: `Já existe um caixa aberto (Caixa ${jaAberta.numero}). Feche-o antes de abrir um novo.`,
          },
        },
        { status: 409 }
      );
    }

    const sessao = await prisma.$transaction(async (tx: any) => {
      const [{ numero }] = await tx.$queryRaw<{ numero: number }[]>`
        select proximo_numero_caixa_sessao(${tenantId}::uuid) as numero
      `;
      return tx.caixaSessao.create({
        data: {
          tenantId,
          numero,
          status: "aberto",
          valorAbertura,
          observacao: body.observacao?.trim() || null,
          abertoPorId: userId,
        },
      });
    });

    return NextResponse.json({ sessao: serializeSessao(sessao) }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    // Corrida rara: duas aberturas simultâneas colidem no índice único parcial.
    if (err && typeof err === "object" && (err as any).code === "P2002") {
      return NextResponse.json(
        { erro: { codigo: "CAIXA_JA_ABERTO", mensagem: "Já existe um caixa aberto para este tenant." } },
        { status: 409 }
      );
    }
    console.error("Erro em POST /api/caixa/sessoes:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao abrir o caixa." } },
      { status: 500 }
    );
  }
}

function serializeSessao(s: any) {
  return {
    id: s.id,
    numero: s.numero,
    status: s.status,
    valor_abertura: Number(s.valorAbertura),
    valor_fechamento_informado: s.valorFechamentoInformado === null ? null : Number(s.valorFechamentoInformado),
    valor_fechamento_calculado: s.valorFechamentoCalculado === null ? null : Number(s.valorFechamentoCalculado),
    observacao: s.observacao,
    data_abertura: s.dataAbertura,
    data_fechamento: s.dataFechamento,
  };
}
