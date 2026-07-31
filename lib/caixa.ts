import { prisma } from "./prisma";

export interface ResumoPorProfissional {
  profissional_id: string;
  profissional_nome: string;
  total_cobrado: number;
  total_comissao: number;
  total_estudio: number;
  quantidade_atendimentos: number;
}

export interface ResumoCaixa {
  periodo: { data_inicio: string; data_fim: string };
  total_cobrado: number;
  total_comissoes: number;
  total_estudio: number;
  quantidade_atendimentos: number;
  por_profissional: ResumoPorProfissional[];
}

// Agregação do Caixa (Documentação da API v1.0, Seção 5), extraída para um
// único lugar porque é usada tanto pela rota GET /api/caixa/resumo (chamada
// pelo front-end autenticado, via Bearer token) quanto diretamente pelo
// Dashboard (Server Component, mesmo processo — não precisa ir e voltar
// por HTTP nem carregar um token, já que o tenant_id já é conhecido ali).
export async function getResumoCaixa(
  tenantId: string,
  inicio: Date,
  fim: Date
): Promise<ResumoCaixa> {
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

  const porProfissionalMap = new Map<string, ResumoPorProfissional>();

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

  return {
    periodo: {
      data_inicio: inicio.toISOString().slice(0, 10),
      data_fim: fim.toISOString().slice(0, 10),
    },
    total_cobrado: round2(totalCobrado),
    total_comissoes: round2(totalComissoes),
    total_estudio: round2(totalEstudio),
    quantidade_atendimentos: atendimentos.length,
    por_profissional: Array.from(porProfissionalMap.values()),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// =============================================================================
// Resumo de uma Sessão de Caixa (PDV, adicionado em 31/07/2026) — usado pelo
// botão "Resumo" enquanto o caixa está aberto e para calcular o valor
// esperado ao fechar o caixa (POST /api/caixa/sessoes/:id/fechar).
//
// Só "Dinheiro" (formaPagamento.contaNoCaixaFisico = true) entra na conta do
// caixa físico: vendas pagas no cartão/pix/boleto aumentam o faturamento do
// dia mas não passam pela gaveta do caixa, então não devem ser somadas nem
// subtraídas do valor esperado em espécie. Sangria e suprimento são sempre
// movimentação física (por definição, é dinheiro saindo/entrando na gaveta),
// então sempre contam.
// =============================================================================
export interface ResumoSessaoCaixa {
  sessao_id: string;
  valor_abertura: number;
  total_vendas: number;
  total_vendas_caixa_fisico: number;
  quantidade_vendas: number;
  total_suprimento: number;
  total_sangria: number;
  total_despesa: number;
  total_despesa_caixa_fisico: number;
  valor_esperado_caixa_fisico: number;
}

export async function getResumoSessaoCaixa(
  tenantId: string,
  sessaoId: string
): Promise<ResumoSessaoCaixa> {
  const sessao = await prisma.caixaSessao.findFirst({ where: { id: sessaoId, tenantId } });
  if (!sessao) {
    throw new Error("Sessão de caixa não encontrada.");
  }

  const [vendas, movimentos] = await Promise.all([
    prisma.venda.findMany({
      where: { tenantId, sessaoId, status: "paga" },
      include: { formaPagamento: { select: { contaNoCaixaFisico: true } } },
    }),
    prisma.caixaMovimento.findMany({
      where: { tenantId, sessaoId },
      include: { formaPagamento: { select: { contaNoCaixaFisico: true } } },
    }),
  ]);

  let totalVendas = 0;
  let totalVendasCaixaFisico = 0;
  for (const v of vendas) {
    const total = Number(v.total);
    totalVendas += total;
    if (v.formaPagamento.contaNoCaixaFisico) {
      totalVendasCaixaFisico += total;
    }
  }

  let totalSuprimento = 0;
  let totalSangria = 0;
  let totalDespesa = 0;
  let totalDespesaCaixaFisico = 0;
  for (const m of movimentos) {
    const valor = Number(m.valor);
    if (m.tipo === "suprimento") totalSuprimento += valor;
    else if (m.tipo === "sangria") totalSangria += valor;
    else if (m.tipo === "despesa") {
      totalDespesa += valor;
      // Sem forma de pagamento informada, assume que saiu do caixa físico.
      if (!m.formaPagamento || m.formaPagamento.contaNoCaixaFisico) {
        totalDespesaCaixaFisico += valor;
      }
    }
  }

  const valorAbertura = Number(sessao.valorAbertura);
  const valorEsperadoCaixaFisico = round2(
    valorAbertura + totalVendasCaixaFisico + totalSuprimento - totalSangria - totalDespesaCaixaFisico
  );

  return {
    sessao_id: sessaoId,
    valor_abertura: round2(valorAbertura),
    total_vendas: round2(totalVendas),
    total_vendas_caixa_fisico: round2(totalVendasCaixaFisico),
    quantidade_vendas: vendas.length,
    total_suprimento: round2(totalSuprimento),
    total_sangria: round2(totalSangria),
    total_despesa: round2(totalDespesa),
    total_despesa_caixa_fisico: round2(totalDespesaCaixaFisico),
    valor_esperado_caixa_fisico: valorEsperadoCaixaFisico,
  };
}
