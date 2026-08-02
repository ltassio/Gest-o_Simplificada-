import { prisma } from "./prisma";
import { getDespesasDoMes } from "./dashboard";

// =============================================================================
// Relatórios Gerenciais — aba nova pedida pelo usuário em 02/08/2026, com
// dois grupos: Financeiro (LTV, Comparativo Anual, Comparativo Mensal,
// Evolução do Faturamento) e Clientes (Clientes Devedores, Evolução de
// Clientes). Diferente do Dashboard (que segue o filtro de período do
// topo), cada relatório aqui define sua própria janela de tempo — são
// telas de análise histórica, não um resumo do momento atual.
//
// getDespesasDoMes (lib/dashboard.ts) é reaproveitada aqui apesar do nome:
// já era genérica antes desta mudança (aceita qualquer inicio/fim, não só
// "o mês"), então não faz sentido duplicar a query de despesas.
// =============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ---------------------------------------------------------------------------
// LTV (Lifetime Value)
// ---------------------------------------------------------------------------
// Definição adotada (documentada aqui por não haver uma única fórmula
// "oficial" de LTV — esta é a mais direta de calcular com o dado que o
// sistema já tem, e a mesma leitura que o dono do negócio faria somando o
// extrato de um cliente): LTV de um cliente = soma de tudo que ele já pagou
// em atendimentos, desde o cadastro até hoje (histórico completo, não só o
// período filtrado). O LTV médio do negócio é a média desse valor entre
// todos os clientes que já tiveram ao menos 1 atendimento — clientes sem
// nenhum atendimento ainda não têm LTV para não puxar a média para baixo
// artificialmente.
export interface ClienteLtv {
  cliente_id: string;
  nome: string;
  receita_total: number;
  qtd_atendimentos: number;
  ticket_medio: number;
  primeiro_atendimento: string;
  ultimo_atendimento: string;
  meses_relacionamento: number;
}

export interface LtvResumo {
  ltv_medio: number;
  ticket_medio_geral: number;
  frequencia_media: number;
  clientes_considerados: number;
  clientes: ClienteLtv[];
}

export async function getLtv(tenantId: string, limite = 30): Promise<LtvResumo> {
  const atendimentos = await prisma.atendimento.findMany({
    where: { tenantId },
    select: {
      clienteId: true,
      valorCobrado: true,
      dataAtendimento: true,
      cliente: { select: { nome: true } },
    },
  });

  if (atendimentos.length === 0) {
    return { ltv_medio: 0, ticket_medio_geral: 0, frequencia_media: 0, clientes_considerados: 0, clientes: [] };
  }

  const porCliente = new Map<
    string,
    { nome: string; receita: number; qtd: number; primeira: Date; ultima: Date }
  >();
  let receitaTotal = 0;

  for (const a of atendimentos) {
    const valor = Number(a.valorCobrado);
    receitaTotal += valor;
    const atual = porCliente.get(a.clienteId) ?? {
      nome: a.cliente.nome,
      receita: 0,
      qtd: 0,
      primeira: a.dataAtendimento,
      ultima: a.dataAtendimento,
    };
    atual.receita += valor;
    atual.qtd += 1;
    if (a.dataAtendimento < atual.primeira) atual.primeira = a.dataAtendimento;
    if (a.dataAtendimento > atual.ultima) atual.ultima = a.dataAtendimento;
    porCliente.set(a.clienteId, atual);
  }

  const clientes: ClienteLtv[] = Array.from(porCliente.entries())
    .map(([id, c]) => ({
      cliente_id: id,
      nome: c.nome,
      receita_total: round2(c.receita),
      qtd_atendimentos: c.qtd,
      ticket_medio: round2(c.receita / c.qtd),
      primeiro_atendimento: c.primeira.toISOString().slice(0, 10),
      ultimo_atendimento: c.ultima.toISOString().slice(0, 10),
      meses_relacionamento:
        Math.round((c.ultima.getTime() - c.primeira.getTime()) / (30 * 86400000)) || 1,
    }))
    .sort((a, b) => b.receita_total - a.receita_total);

  return {
    ltv_medio: round2(receitaTotal / porCliente.size),
    ticket_medio_geral: round2(receitaTotal / atendimentos.length),
    frequencia_media: round2(atendimentos.length / porCliente.size),
    clientes_considerados: porCliente.size,
    clientes: clientes.slice(0, limite),
  };
}

// ---------------------------------------------------------------------------
// Comparativo Anual
// ---------------------------------------------------------------------------
export interface AnoComparativo {
  ano: number;
  receita: number;
  comissoes: number;
  despesas: number;
  lucro: number;
  ticket_medio: number;
  qtd_atendimentos: number;
  clientes_novos: number;
  variacao_receita_pct: number | null;
}

// Um ano por linha, do primeiro ano com dado (atendimento ou cliente
// cadastrado) até o ano atual (que entra parcial, só até hoje — comparar
// um ano incompleto com anos fechados é uma limitação conhecida e por isso
// o card do relatório avisa isso, não escondemos o dado).
export async function getComparativoAnual(tenantId: string): Promise<AnoComparativo[]> {
  const [primeiroAtendimento, primeiroCliente] = await Promise.all([
    prisma.atendimento.findFirst({
      where: { tenantId },
      orderBy: { dataAtendimento: "asc" },
      select: { dataAtendimento: true },
    }),
    prisma.cliente.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const candidatos = [
    primeiroAtendimento?.dataAtendimento.getFullYear(),
    primeiroCliente?.createdAt.getFullYear(),
  ].filter((a): a is number => typeof a === "number");
  const anoInicio = candidatos.length > 0 ? Math.min(...candidatos) : anoAtual;

  const anos: AnoComparativo[] = [];
  let receitaAnoAnterior: number | null = null;

  for (let ano = anoInicio; ano <= anoAtual; ano++) {
    const inicio = new Date(ano, 0, 1, 0, 0, 0, 0);
    const fimAnoCheio = new Date(ano, 11, 31, 23, 59, 59, 999);
    const fim = ano === anoAtual ? agora : fimAnoCheio;

    const [atendimentos, despesas, clientesNovos] = await Promise.all([
      prisma.atendimento.findMany({
        where: { tenantId, dataAtendimento: { gte: inicio, lte: fim } },
        select: { valorCobrado: true, valorComissao: true },
      }),
      getDespesasDoMes(tenantId, inicio, fim),
      prisma.cliente.count({ where: { tenantId, createdAt: { gte: inicio, lte: fim } } }),
    ]);

    const receita = round2(atendimentos.reduce((acc, a) => acc + Number(a.valorCobrado), 0));
    const comissoes = round2(atendimentos.reduce((acc, a) => acc + Number(a.valorComissao), 0));
    const qtd = atendimentos.length;

    anos.push({
      ano,
      receita,
      comissoes,
      despesas: round2(despesas),
      lucro: round2(receita - comissoes - despesas),
      ticket_medio: qtd > 0 ? round2(receita / qtd) : 0,
      qtd_atendimentos: qtd,
      clientes_novos: clientesNovos,
      variacao_receita_pct:
        receitaAnoAnterior !== null && receitaAnoAnterior > 0
          ? round2(((receita - receitaAnoAnterior) / receitaAnoAnterior) * 100)
          : null,
    });

    receitaAnoAnterior = receita;
  }

  return anos.reverse(); // ano mais recente primeiro na tabela
}

// ---------------------------------------------------------------------------
// Comparativo Mensal (últimos N meses, padrão 12 — janela corrida, não
// calendário fechado, para sempre mostrar o mês corrente também)
// ---------------------------------------------------------------------------
export interface MesComparativo {
  ano: number;
  mes: number;
  label: string;
  receita: number;
  despesas: number;
  lucro: number;
  ticket_medio: number;
  qtd_atendimentos: number;
  variacao_receita_pct: number | null;
}

export async function getComparativoMensal(
  tenantId: string,
  quantidadeMeses = 12
): Promise<MesComparativo[]> {
  const agora = new Date();
  const janela: { ano: number; mes: number; inicio: Date; fim: Date }[] = [];

  for (let i = quantidadeMeses - 1; i >= 0; i--) {
    const referencia = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const inicio = new Date(referencia.getFullYear(), referencia.getMonth(), 1, 0, 0, 0, 0);
    const fimMesCheio = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0, 23, 59, 59, 999);
    const fim = fimMesCheio > agora ? agora : fimMesCheio;
    janela.push({ ano: referencia.getFullYear(), mes: referencia.getMonth() + 1, inicio, fim });
  }

  const resultado: MesComparativo[] = [];
  let receitaAnterior: number | null = null;

  for (const m of janela) {
    const [atendimentos, despesas] = await Promise.all([
      prisma.atendimento.findMany({
        where: { tenantId, dataAtendimento: { gte: m.inicio, lte: m.fim } },
        select: { valorCobrado: true, valorComissao: true },
      }),
      getDespesasDoMes(tenantId, m.inicio, m.fim),
    ]);

    const receita = round2(atendimentos.reduce((acc, a) => acc + Number(a.valorCobrado), 0));
    const comissoes = round2(atendimentos.reduce((acc, a) => acc + Number(a.valorComissao), 0));
    const qtd = atendimentos.length;

    resultado.push({
      ano: m.ano,
      mes: m.mes,
      label: `${MESES_LABEL[m.mes - 1]}/${m.ano}`,
      receita,
      despesas: round2(despesas),
      lucro: round2(receita - comissoes - despesas),
      ticket_medio: qtd > 0 ? round2(receita / qtd) : 0,
      qtd_atendimentos: qtd,
      variacao_receita_pct:
        receitaAnterior !== null && receitaAnterior > 0
          ? round2(((receita - receitaAnterior) / receitaAnterior) * 100)
          : null,
    });

    receitaAnterior = receita;
  }

  return resultado.reverse(); // mês mais recente primeiro na tabela
}

// ---------------------------------------------------------------------------
// Evolução do Faturamento — mesma base do Comparativo Mensal, mas em ordem
// cronológica (mais antigo → mais recente) para alimentar um gráfico de
// linha, com o resumo de crescimento do período inteiro.
// ---------------------------------------------------------------------------
export interface FaturamentoPonto {
  label: string;
  receita: number;
}

export interface EvolucaoFaturamento {
  pontos: FaturamentoPonto[];
  receita_media_mensal: number;
  variacao_total_pct: number | null;
}

export async function getEvolucaoFaturamento(
  tenantId: string,
  quantidadeMeses = 12
): Promise<EvolucaoFaturamento> {
  const meses = await getComparativoMensal(tenantId, quantidadeMeses);
  const cronologico = [...meses].reverse();
  const pontos = cronologico.map((m) => ({ label: m.label, receita: m.receita }));

  const primeira = pontos[0]?.receita ?? 0;
  const ultima = pontos[pontos.length - 1]?.receita ?? 0;
  const media = pontos.length > 0 ? pontos.reduce((acc, p) => acc + p.receita, 0) / pontos.length : 0;

  return {
    pontos,
    receita_media_mensal: round2(media),
    variacao_total_pct: primeira > 0 ? round2(((ultima - primeira) / primeira) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Clientes Devedores — contas a receber ainda em aberto (status
// "a_receber"), agrupadas por cliente. "Vencida" é sempre derivado (nunca
// gravado como status, mesma regra de lib/fluxoCaixa.ts): conta em aberto
// com data_vencimento no passado.
// ---------------------------------------------------------------------------
export interface ClienteDevedor {
  cliente_id: string;
  nome: string;
  telefone: string | null;
  qtd_contas: number;
  total_devido: number;
  qtd_vencidas: number;
  total_vencido: number;
  dias_atraso_max: number;
  proximo_vencimento: string | null;
}

export interface ClientesDevedoresResumo {
  clientes: ClienteDevedor[];
  total_geral: number;
  total_vencido_geral: number;
}

export async function getClientesDevedores(tenantId: string): Promise<ClientesDevedoresResumo> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const contas = await prisma.contaReceber.findMany({
    where: { tenantId, status: "a_receber" },
    select: {
      clienteId: true,
      valor: true,
      dataVencimento: true,
      cliente: { select: { nome: true, telefone: true } },
    },
  });

  const porCliente = new Map<
    string,
    {
      nome: string;
      telefone: string | null;
      total: number;
      qtd: number;
      totalVencido: number;
      qtdVencidas: number;
      diasAtrasoMax: number;
      proximoVencimento: Date | null;
    }
  >();

  for (const c of contas) {
    const valor = Number(c.valor);
    const vencida = c.dataVencimento < hoje;
    const diasAtraso = vencida
      ? Math.round((hoje.getTime() - c.dataVencimento.getTime()) / 86400000)
      : 0;

    const atual = porCliente.get(c.clienteId) ?? {
      nome: c.cliente.nome,
      telefone: c.cliente.telefone,
      total: 0,
      qtd: 0,
      totalVencido: 0,
      qtdVencidas: 0,
      diasAtrasoMax: 0,
      proximoVencimento: null as Date | null,
    };

    atual.total += valor;
    atual.qtd += 1;
    if (vencida) {
      atual.totalVencido += valor;
      atual.qtdVencidas += 1;
      atual.diasAtrasoMax = Math.max(atual.diasAtrasoMax, diasAtraso);
    } else if (!atual.proximoVencimento || c.dataVencimento < atual.proximoVencimento) {
      atual.proximoVencimento = c.dataVencimento;
    }

    porCliente.set(c.clienteId, atual);
  }

  const clientes: ClienteDevedor[] = Array.from(porCliente.entries())
    .map(([id, c]) => ({
      cliente_id: id,
      nome: c.nome,
      telefone: c.telefone,
      qtd_contas: c.qtd,
      total_devido: round2(c.total),
      qtd_vencidas: c.qtdVencidas,
      total_vencido: round2(c.totalVencido),
      dias_atraso_max: c.diasAtrasoMax,
      proximo_vencimento: c.proximoVencimento ? c.proximoVencimento.toISOString().slice(0, 10) : null,
    }))
    .sort((a, b) => b.total_devido - a.total_devido);

  return {
    clientes,
    total_geral: round2(clientes.reduce((acc, c) => acc + c.total_devido, 0)),
    total_vencido_geral: round2(clientes.reduce((acc, c) => acc + c.total_vencido, 0)),
  };
}

// ---------------------------------------------------------------------------
// Evolução de Clientes — novos cadastros por mês (últimos N meses) + total
// acumulado de clientes ao longo do tempo. Não há "churn" mês a mês porque
// o schema só guarda o estado atual de "ativo" (clientes.ativo), sem
// histórico de quando cada cliente foi desativado — mostrar isso exigiria
// inventar uma data que o sistema não tem, por isso ativos/inativos aqui
// aparecem como totais atuais, não como série no tempo.
// ---------------------------------------------------------------------------
export interface ClientesEvolucaoPonto {
  label: string;
  novos: number;
  total_acumulado: number;
}

export interface EvolucaoClientes {
  pontos: ClientesEvolucaoPonto[];
  total_ativos: number;
  total_inativos: number;
  novos_ultimo_mes: number;
}

export async function getEvolucaoClientes(
  tenantId: string,
  quantidadeMeses = 12
): Promise<EvolucaoClientes> {
  const agora = new Date();
  const inicioJanela = new Date(agora.getFullYear(), agora.getMonth() - (quantidadeMeses - 1), 1, 0, 0, 0, 0);

  const [clientesNaJanela, totalAntesDaJanela, totalAtivos, totalInativos] = await Promise.all([
    prisma.cliente.findMany({
      where: { tenantId, createdAt: { gte: inicioJanela } },
      select: { createdAt: true },
    }),
    prisma.cliente.count({ where: { tenantId, createdAt: { lt: inicioJanela } } }),
    prisma.cliente.count({ where: { tenantId, ativo: true } }),
    prisma.cliente.count({ where: { tenantId, ativo: false } }),
  ]);

  const novosPorMes = new Map<string, number>();
  for (const c of clientesNaJanela) {
    const chave = `${c.createdAt.getFullYear()}-${c.createdAt.getMonth()}`;
    novosPorMes.set(chave, (novosPorMes.get(chave) ?? 0) + 1);
  }

  const pontos: ClientesEvolucaoPonto[] = [];
  let acumulado = totalAntesDaJanela;
  for (let i = 0; i < quantidadeMeses; i++) {
    const referencia = new Date(inicioJanela.getFullYear(), inicioJanela.getMonth() + i, 1);
    const chave = `${referencia.getFullYear()}-${referencia.getMonth()}`;
    const novos = novosPorMes.get(chave) ?? 0;
    acumulado += novos;
    pontos.push({
      label: `${MESES_LABEL[referencia.getMonth()]}/${referencia.getFullYear()}`,
      novos,
      total_acumulado: acumulado,
    });
  }

  return {
    pontos,
    total_ativos: totalAtivos,
    total_inativos: totalInativos,
    novos_ultimo_mes: pontos[pontos.length - 1]?.novos ?? 0,
  };
}
