import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantFromRequest, ApiAuthError } from "@/lib/auth";

interface ItemPayload {
  servico_id: string;
  profissional_id: string;
  quantidade?: number;
  valor_unitario: number;
  agendamento_id?: string;
}

// GET /api/caixa/vendas?limit=20 — últimas vendas da sessão de caixa aberta
// (ou, se o caixa estiver fechado, simplesmente vazio — histórico completo
// fica para uma tela de relatório futura).
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

    const sessao = await prisma.caixaSessao.findFirst({ where: { tenantId, status: "aberto" } });
    if (!sessao) {
      return NextResponse.json({ vendas: [] });
    }

    const vendas = await prisma.venda.findMany({
      where: { tenantId, sessaoId: sessao.id },
      orderBy: { dataVenda: "desc" },
      take: limit,
      include: {
        cliente: { select: { nome: true } },
        formaPagamento: { select: { nome: true } },
        itens: { include: { servico: { select: { nome: true } }, profissional: { select: { nome: true } } } },
      },
    });

    return NextResponse.json({ vendas: vendas.map(serializeVenda) });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em GET /api/caixa/vendas:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao listar as vendas." } },
      { status: 500 }
    );
  }
}

// POST /api/caixa/vendas
// Body: { cliente_id, forma_pagamento_id, desconto?, itens: [{ servico_id,
//         profissional_id, quantidade?, valor_unitario, agendamento_id? }] }
//
// Regras de negócio aplicadas no servidor (nunca no cliente), mesmo padrão
// de /api/caixa/atendimentos:
// 1. A sessão de caixa é sempre a "aberto" do tenant no momento — nunca vem
//    do corpo da requisição. Sem caixa aberto, a venda é recusada (409).
// 2. O desconto da venda é rateado proporcionalmente entre os itens do
//    carrinho, e o valor_cobrado gravado em cada atendimento já sai com
//    esse rateio aplicado — mas SEMPRE como valor bruto (antes de tirar a
//    comissão do profissional), nunca líquido. A comissão de cada item é
//    calculada em cima desse valor bruto pós-desconto, igual ao fluxo
//    single-item que já existia.
// 3. Cada item pode opcionalmente referenciar um agendamento pendente, que
//    é marcado como concluído na mesma transação (igual ao fluxo antigo).
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(req);
    const body = await req.json();

    const clienteId: string | undefined = body.cliente_id;
    const formaPagamentoId: string | undefined = body.forma_pagamento_id;
    const desconto = Number(body.desconto ?? 0);
    const itens: ItemPayload[] = Array.isArray(body.itens) ? body.itens : [];

    if (!clienteId || !formaPagamentoId) {
      return NextResponse.json(
        { erro: { codigo: "PARAMETROS_INVALIDOS", mensagem: "cliente_id e forma_pagamento_id são obrigatórios." } },
        { status: 400 }
      );
    }
    if (itens.length === 0) {
      return NextResponse.json(
        { erro: { codigo: "CARRINHO_VAZIO", mensagem: "Adicione pelo menos 1 item à venda." } },
        { status: 400 }
      );
    }
    if (Number.isNaN(desconto) || desconto < 0) {
      return NextResponse.json(
        { erro: { codigo: "VALOR_INVALIDO", mensagem: "desconto precisa ser zero ou maior." } },
        { status: 400 }
      );
    }
    for (const item of itens) {
      const qtd = Number(item.quantidade ?? 1);
      const unit = Number(item.valor_unitario);
      if (!item.servico_id || !item.profissional_id) {
        return NextResponse.json(
          { erro: { codigo: "PARAMETROS_INVALIDOS", mensagem: "Cada item precisa de servico_id e profissional_id." } },
          { status: 400 }
        );
      }
      if (Number.isNaN(qtd) || qtd <= 0 || Number.isNaN(unit) || unit <= 0) {
        return NextResponse.json(
          { erro: { codigo: "VALOR_INVALIDO", mensagem: "Cada item precisa de quantidade e valor_unitario maiores que zero." } },
          { status: 400 }
        );
      }
    }

    const sessao = await prisma.caixaSessao.findFirst({ where: { tenantId, status: "aberto" } });
    if (!sessao) {
      return NextResponse.json(
        { erro: { codigo: "CAIXA_FECHADO", mensagem: "Abra o caixa antes de lançar uma venda." } },
        { status: 409 }
      );
    }

    const [cliente, formaPagamento] = await Promise.all([
      prisma.cliente.findFirst({ where: { id: clienteId, tenantId } }),
      prisma.formaPagamento.findFirst({ where: { id: formaPagamentoId, tenantId } }),
    ]);
    if (!cliente || !formaPagamento) {
      return NextResponse.json(
        { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Cliente ou forma de pagamento não encontrados." } },
        { status: 404 }
      );
    }

    const servicoIds = Array.from(new Set(itens.map((i) => i.servico_id)));
    const profissionalIds = Array.from(new Set(itens.map((i) => i.profissional_id)));
    const agendamentoIds = itens.map((i) => i.agendamento_id).filter(Boolean) as string[];

    const [servicos, profissionais, agendamentos] = await Promise.all([
      prisma.servico.findMany({ where: { id: { in: servicoIds }, tenantId } }),
      prisma.profissional.findMany({ where: { id: { in: profissionalIds }, tenantId } }),
      agendamentoIds.length
        ? prisma.agendamento.findMany({ where: { id: { in: agendamentoIds }, tenantId } })
        : Promise.resolve([] as any[]),
    ]);
    const servicoMap = new Map<string, any>(servicos.map((s: any) => [s.id, s]));
    const profissionalMap = new Map<string, any>(profissionais.map((p: any) => [p.id, p]));
    const agendamentoMap = new Map<string, any>((agendamentos as any[]).map((a: any) => [a.id, a]));

    for (const item of itens) {
      if (!servicoMap.has(item.servico_id) || !profissionalMap.has(item.profissional_id)) {
        return NextResponse.json(
          { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Produto/serviço ou profissional não encontrado." } },
          { status: 404 }
        );
      }
      if (item.agendamento_id) {
        const ag = agendamentoMap.get(item.agendamento_id);
        if (!ag) {
          return NextResponse.json(
            { erro: { codigo: "RECURSO_FORA_DO_TENANT", mensagem: "Agendamento não encontrado." } },
            { status: 404 }
          );
        }
        if (ag.status === "concluido") {
          return NextResponse.json(
            { erro: { codigo: "AGENDAMENTO_JA_CONCLUIDO", mensagem: "Este agendamento já foi concluído." } },
            { status: 422 }
          );
        }
      }
    }

    // Bruto de cada item (preço de tabela x quantidade, sem desconto ainda).
    const linhas = itens.map((item) => {
      const quantidade = Number(item.quantidade ?? 1);
      const valorUnitario = Number(item.valor_unitario);
      return { item, quantidade, valorUnitario, brutoLinha: round2(valorUnitario * quantidade) };
    });

    const subtotal = round2(linhas.reduce((acc, l) => acc + l.brutoLinha, 0));
    if (desconto > subtotal) {
      return NextResponse.json(
        { erro: { codigo: "DESCONTO_MAIOR_QUE_SUBTOTAL", mensagem: "O desconto não pode ser maior que o subtotal da venda." } },
        { status: 400 }
      );
    }
    const total = round2(subtotal - desconto);

    // Rateia o total pós-desconto entre os itens, proporcional ao peso de
    // cada um no subtotal. Ajusta o último item para absorver a diferença
    // de arredondamento (soma das linhas precisa bater exatamente com total).
    let somaAlocada = 0;
    const linhasComValorCobrado = linhas.map((l, idx) => {
      let valorCobrado: number;
      if (idx === linhas.length - 1) {
        valorCobrado = round2(total - somaAlocada);
      } else {
        const proporcao = subtotal > 0 ? l.brutoLinha / subtotal : 1 / linhas.length;
        valorCobrado = round2(total * proporcao);
        somaAlocada = round2(somaAlocada + valorCobrado);
      }
      return { ...l, valorCobrado: Math.max(valorCobrado, 0) };
    });

    const resultado = await prisma.$transaction(async (tx: any) => {
      const [{ numero }] = await tx.$queryRaw<{ numero: number }[]>`
        select proximo_numero_venda(${tenantId}::uuid) as numero
      `;

      const venda = await tx.venda.create({
        data: {
          tenantId,
          sessaoId: sessao.id,
          numero,
          clienteId,
          formaPagamentoId,
          subtotal,
          desconto,
          total,
        },
      });

      const itensCriados = [];
      for (const l of linhasComValorCobrado) {
        const profissional = profissionalMap.get(l.item.profissional_id)!;
        const percentualComissaoAplicado = Number(profissional.percentualComissao);
        const valorComissao = round2((l.valorCobrado * percentualComissaoAplicado) / 100);
        const valorEstudio = round2(l.valorCobrado - valorComissao);

        const atendimento = await tx.atendimento.create({
          data: {
            tenantId,
            vendaId: venda.id,
            agendamentoId: l.item.agendamento_id ?? undefined,
            clienteId,
            profissionalId: l.item.profissional_id,
            servicoId: l.item.servico_id,
            quantidade: l.quantidade,
            valorUnitario: l.valorUnitario,
            valorCobrado: l.valorCobrado,
            percentualComissaoAplicado,
            valorComissao,
            valorEstudio,
          },
        });

        if (l.item.agendamento_id) {
          await tx.agendamento.update({
            where: { id: l.item.agendamento_id },
            data: { status: "concluido" },
          });
        }

        itensCriados.push(atendimento);
      }

      return { venda, itens: itensCriados };
    });

    return NextResponse.json(
      {
        id: resultado.venda.id,
        numero: resultado.venda.numero,
        subtotal,
        desconto,
        total,
        quantidade_itens: resultado.itens.length,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ erro: { codigo: err.codigo, mensagem: err.message } }, { status: err.status });
    }
    console.error("Erro em POST /api/caixa/vendas:", err);
    return NextResponse.json(
      { erro: { codigo: "ERRO_INTERNO", mensagem: "Erro inesperado ao registrar a venda." } },
      { status: 500 }
    );
  }
}

function serializeVenda(v: any) {
  return {
    id: v.id,
    numero: v.numero,
    cliente_nome: v.cliente?.nome ?? "-",
    forma_pagamento: v.formaPagamento?.nome ?? "-",
    subtotal: Number(v.subtotal),
    desconto: Number(v.desconto),
    total: Number(v.total),
    status: v.status,
    data_venda: v.dataVenda,
    itens: v.itens.map((i: any) => ({
      servico_nome: i.servico?.nome ?? "-",
      profissional_nome: i.profissional?.nome ?? "-",
      quantidade: i.quantidade,
      valor_unitario: Number(i.valorUnitario),
      valor_cobrado: Number(i.valorCobrado),
    })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
