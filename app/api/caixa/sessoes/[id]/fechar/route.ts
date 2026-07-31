import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";
import { getResumoSessaoCaixa } from "@/lib/caixa";

// POST /api/caixa/sessoes/:id/fechar
// Body: { valor_fechamento_informado: number, observacao?: string }
// Fecha a sessão de caixa do dia: grava o valor que o operador contou na
// gaveta e o valor que o sistema esperava (abertura + vendas em dinheiro +
// suprimento - sangria - despesa em dinheiro), para conferência. A
// diferença entre os dois (se houver) fica só nos dois campos salvos —
// esta rota não bloqueia o fechamento por causa de diferença, só registra.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, tenantId } = await getTenantFromRequest(req);
    const body = await req.json();

    const valorInformado = Number(body.valor_fechamento_informado);
    if (Number.isNaN(valorInformado) || valorInformado < 0) {
      return NextResponse.json(
        {
          erro: {
            codigo: "VALOR_INVALIDO",
            mensagem: "valor_fechamento_informado é obrigatório e precisa ser zero ou maior.",
          },
        },
        { status: 400 }
      );
    }

    const sessao = await prisma.caixaSessao.findFirst({ where: { id: params.id, tenantId } });
    if (!sessao) {
      return NextResponse.json(
        { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Sessão de caixa não encontrada." } },
        { status: 404 }
      );
    }
    if (sessao.status === "fechado") {
      return NextResponse.json(
        { erro: { codigo: "CAIXA_JA_FECHADO", mensagem: "Este caixa já foi fechado." } },
        { status: 422 }
      );
    }

    const resumo = await getResumoSessaoCaixa(tenantId, sessao.id);

    const sessaoFechada = await prisma.caixaSessao.update({
      where: { id: sessao.id },
      data: {
        status: "fechado",
        valorFechamentoInformado: valorInformado,
        valorFechamentoCalculado: resumo.valor_esperado_caixa_fisico,
        fechadoPorId: userId,
        dataFechamento: new Date(),
        observacao: body.observacao?.trim() || sessao.observacao,
      },
    });

    return NextResponse.json({
      sessao: {
        id: sessaoFechada.id,
        numero: sessaoFechada.numero,
        status: sessaoFechada.status,
        valor_abertura: Number(sessaoFechada.valorAbertura),
        valor_fechamento_informado: Number(sessaoFechada.valorFechamentoInformado),
        valor_fechamento_calculado: Number(sessaoFechada.valorFechamentoCalculado),
        diferenca: round2(valorInformado - resumo.valor_esperado_caixa_fisico),
        data_abertura: sessaoFechada.dataAbertura,
        data_fechamento: sessaoFechada.dataFechamento,
      },
      resumo,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em POST /api/caixa/sessoes/:id/fechar:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao fechar o caixa." } },
      { status: 500 }
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
