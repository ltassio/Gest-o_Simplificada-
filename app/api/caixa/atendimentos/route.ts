import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";

// POST /api/caixa/atendimentos
// Contrato completo em: Documentação da API v1.0, Seção 4.
//
// Regras de negócio aplicadas no servidor (nunca no cliente):
// 1. O percentual de comissão é copiado (snapshot) do profissional no
//    momento do atendimento — decisão registrada no Documento de Modelagem
//    de Banco de Dados v1.0, Seção 5.
// 2. valor_comissao e valor_estudio são calculados aqui, não recebidos do
//    front-end, para impedir adulteração de valores financeiros.
// 3. Se vinculado a um agendamento, o agendamento é marcado como concluído
//    na mesma transação.
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const body = await req.json();

    const clienteId: string | undefined = body.cliente_id;
    const profissionalId: string | undefined = body.profissional_id;
    const servicoId: string | undefined = body.servico_id;
    const valorCobrado: number | undefined = body.valor_cobrado;
    const agendamentoId: string | undefined = body.agendamento_id;
    const dataAtendimento: string | undefined = body.data_atendimento;

    if (!clienteId || !profissionalId || !servicoId || valorCobrado === undefined) {
      return NextResponse.json(
        {
          erro: {
            codigo: "PARAMETROS_INVALIDOS",
            mensagem: "cliente_id, profissional_id, servico_id e valor_cobrado são obrigatórios.",
          },
        },
        { status: 400 }
      );
    }

    if (valorCobrado <= 0) {
      return NextResponse.json(
        { erro: { codigo: "VALOR_INVALIDO", mensagem: "valor_cobrado precisa ser maior que zero." } },
        { status: 400 }
      );
    }

    const [cliente, profissional, servico] = await Promise.all([
      prisma.cliente.findFirst({ where: { id: clienteId, tenantId } }),
      prisma.profissional.findFirst({ where: { id: profissionalId, tenantId } }),
      prisma.servico.findFirst({ where: { id: servicoId, tenantId } }),
    ]);

    if (!cliente || !profissional || !servico) {
      return NextResponse.json(
        { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Cliente, profissional ou serviço não encontrado." } },
        { status: 404 }
      );
    }

    let agendamento = null;
    if (agendamentoId) {
      agendamento = await prisma.agendamento.findFirst({
        where: { id: agendamentoId, tenantId },
      });
      if (!agendamento) {
        return NextResponse.json(
          { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Agendamento não encontrado." } },
          { status: 404 }
        );
      }
      if (agendamento.status === "concluido") {
        return NextResponse.json(
          { erro: { codigo: "AGENDAMENTO_JA_CONCLUIDO", mensagem: "Este agendamento já foi concluído." } },
          { status: 422 }
        );
      }
    }

    const percentualComissaoAplicado = Number(profissional.percentualComissao);
    const valorComissao = round2((valorCobrado * percentualComissaoAplicado) / 100);
    const valorEstudio = round2(valorCobrado - valorComissao);

    // Nota: "tx" é tipado como "any" porque o Prisma Client precisa rodar
    // "prisma generate" (baseado no schema.prisma) para gerar seus tipos
    // completos — isso acontece automaticamente no deploy (postinstall).
    const atendimento = await prisma.$transaction(async (tx: any) => {
      const novoAtendimento = await tx.atendimento.create({
        data: {
          tenantId,
          agendamentoId: agendamento?.id,
          clienteId,
          profissionalId,
          servicoId,
          valorCobrado,
          percentualComissaoAplicado,
          valorComissao,
          valorEstudio,
          dataAtendimento: dataAtendimento ? new Date(dataAtendimento) : undefined,
        },
      });

      if (agendamento) {
        await tx.agendamento.update({
          where: { id: agendamento.id },
          data: { status: "concluido" },
        });
      }

      return novoAtendimento;
    });

    return NextResponse.json(
      {
        id: atendimento.id,
        cliente_id: atendimento.clienteId,
        profissional_id: atendimento.profissionalId,
        servico_id: atendimento.servicoId,
        agendamento_id: atendimento.agendamentoId,
        valor_cobrado: Number(atendimento.valorCobrado),
        percentual_comissao_aplicado: Number(atendimento.percentualComissaoAplicado),
        valor_comissao: Number(atendimento.valorComissao),
        valor_estudio: Number(atendimento.valorEstudio),
        data_atendimento: atendimento.dataAtendimento,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em /api/caixa/atendimentos:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao registrar o atendimento." } },
      { status: 500 }
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
