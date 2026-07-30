import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";
import { getResumoCaixa } from "@/lib/caixa";

// GET /api/caixa/resumo?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
// Contrato completo em: Documentação da API v1.0, Seção 5.
// A lógica de agregação vive em lib/caixa.ts (reaproveitada pelo Dashboard).
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

    const resumo = await getResumoCaixa(tenantId, inicio, fim);
    return NextResponse.json(resumo);
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
