import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";

// GET /api/caixa/resumo?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
// Contrato completo em: Documentação da API v1.0, Seção 5.
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const { searchParams } = new URL(req.url);

    const dataInicio = searchParams.get("data_inicio");
    const dataFim = searchParams.get("data_fim");

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        {
          erro: {
            codigo: "PARAMETROS_INVALIDOS",
            mensagem: "data_inicio e data_fim são obrigatórios (formato YYYY-MM-DD).",
          },
        },
        { status: 400 }
      );
    }

    const inicio = new Date(`${dataInicio}T00:00:00`);
    const fim = new Date(`${dataFim}T23:59:59.999`);

    const atendimentos = await prisma.atendimento.findMany({
      where: {
        tenantId,
        dataAtendimento: { gte: inicio, lte: fim },
      },
      include: { profissional: { select: { id: true, nome: true } } },
    });

    let totalCobrado = 0;
    let totalComissoes = 0;
    let totalEstudio = 0;

    const porProfissionalMap = new Map<
      string,
      { profissional_id: string; profissional_nome: string; total_cobrado: number; total_comissao: number; total_estudio: number; quantidade_atendimentos: number }
    >();

    for (const a of atendimentos) {
      const valorCobrado = Number(a.valorCobrado);
      const valorComissao = Number(a.valorComissao);
      const valorEstudio = Number(a.valorEstudio);

      totalCobrado += valorCobrado;
      totalComissoes += valorComissao;
      totalEstudio += valorEstudio;

      const chave = a.profissionalId;
      const atual = porProfissionalMap.get(chave) ?? {
        profissional_id: a.profissionalId,
        profissional_nome: a.profissional.nome,
        total_cobrado: 0,
        total_comissao: 0,
        total_estudio: 0,
        quantidade_atendimentos: 0,
      };
      atual.total_cobrado = round2(atual.total_cobrado + valorCobrado);
      atual.total_comissao = round2(atual.total_comissao + valorComissao);
      atual.total_estudio = round2(atual.total_estudio + valorEstudio);
      atual.quantidade_atendimentos += 1;
      porProfissionalMap.set(chave, atual);
    }

    return NextResponse.json({
      periodo: { data_inicio: dataInicio, data_fim: dataFim },
      total_cobrado: round2(totalCobrado),
      total_comissoes: round2(totalComissoes),
      total_estudio: round2(totalEstudio),
      quantidade_atendimentos: atendimentos.length,
      por_profissional: Array.from(porProfissionalMap.values()),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em /api/caixa/resumo:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao gerar o resumo de caixa." } },
      { status: 500 }
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
