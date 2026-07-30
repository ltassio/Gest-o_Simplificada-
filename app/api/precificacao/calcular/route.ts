import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";
import { calcularPrecoSugerido, PrecificacaoError } from "@/lib/precificacao";

// POST /api/precificacao/calcular
// Contrato completo em: Documentação da API v1.0, Seção 3.
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const body = await req.json();

    const servicoId: string | undefined = body.servico_id;
    const profissionalId: string | undefined = body.profissional_id;
    const percentualComissaoPadrao: number | undefined = body.percentual_comissao_padrao;

    if (!servicoId) {
      return NextResponse.json(
        { erro: { codigo: "PARAMETROS_INVALIDOS", mensagem: "servico_id é obrigatório." } },
        { status: 400 }
      );
    }

    const servico = await prisma.servico.findFirst({
      where: { id: servicoId, tenantId },
    });
    if (!servico) {
      return NextResponse.json(
        { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Serviço não encontrado." } },
        { status: 404 }
      );
    }

    const parametros = await prisma.parametroPrecificacao.findUnique({
      where: { tenantId },
    });
    if (!parametros) {
      return NextResponse.json(
        {
          erro: {
            codigo: "PARAMETROS_NAO_CONFIGURADOS",
            mensagem:
              "Configure os parâmetros de precificação (custo fixo mensal, horas produtivas, imposto, margem) antes de calcular preços.",
          },
        },
        // 422, não 400: os dados enviados são válidos, o problema é uma
        // pré-condição de negócio ausente (Documentação da API v1.0, Seção 3.4).
        { status: 422 }
      );
    }

    let percentualComissao: number;
    if (profissionalId) {
      const profissional = await prisma.profissional.findFirst({
        where: { id: profissionalId, tenantId },
      });
      if (!profissional) {
        return NextResponse.json(
          { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Profissional não encontrado." } },
          { status: 404 }
        );
      }
      percentualComissao = Number(profissional.percentualComissao);
    } else if (percentualComissaoPadrao !== undefined) {
      percentualComissao = percentualComissaoPadrao;
    } else {
      percentualComissao = 0;
    }

    const resultado = calcularPrecoSugerido({
      custoMaterial: Number(servico.custoMaterial),
      duracaoMinutos: servico.duracaoMinutos,
      custoFixoMensal: Number(parametros.custoFixoMensal),
      horasProdutivasMes: Number(parametros.horasProdutivasMes),
      percentualComissao,
      percentualImposto: Number(parametros.percentualImposto),
      percentualMargemDesejada: Number(parametros.percentualMargemDesejada),
    });

    return NextResponse.json({
      preco_sugerido: resultado.precoSugerido,
      detalhamento: {
        custo_material: resultado.detalhamento.custoMaterial,
        custo_hora_cadeira: resultado.detalhamento.custoHoraCadeira,
        custo_mao_de_obra: resultado.detalhamento.custoMaoDeObra,
        percentual_comissao: resultado.detalhamento.percentualComissao,
        percentual_imposto: resultado.detalhamento.percentualImposto,
        percentual_margem_desejada: resultado.detalhamento.percentualMargemDesejada,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    if (err instanceof PrecificacaoError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em /api/precificacao/calcular:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao calcular o preço sugerido." } },
      { status: 500 }
    );
  }
}
