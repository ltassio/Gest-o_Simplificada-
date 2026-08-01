import { prisma } from "./prisma";
import type { ResumoCaixa } from "./caixa";
import type { FluxoCaixa } from "./fluxoCaixa";

// =============================================================================
// Indicadores do Dashboard Executivo (EF-001 — Dashboard Executivo e
// Business Intelligence, anexada pelo usuário em 30/07/2026).
//
// A EF descreve um BI completo (multi-unidade, Marketing com CAC/ROI, IA
// com "insights e recomendações", exportação PDF/Excel/CSV, cache Redis,
// tempo real). Este arquivo implementa os blocos para os quais o sistema
// já tem dado real (Agenda, Clientes, Profissionais via caixa.ts, Serviços,
// Produtos, Financeiro/contas vencidas) e monta alertas/insights por regra
// simples — a própria EF lista "Machine Learning avançado" como Fora do
// Escopo (Seção 3), então heurística sobre os dados existentes é a
// implementação correta aqui, não um ML de verdade. Marketing (CAC/ROI/
// origem) e "IA preditiva" não têm fonte de dado nenhuma no sistema hoje
// (não há rastreio de origem de cliente nem gasto de mkt) — ficam como
// "em breve" na tela em vez de inventar número.
// =============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface AgendaResumo {
  total: number;
  agendados: number;
  concluidos: number;
  cancelados: number;
  nao_compareceu: number;
  taxa_cancelamento: number;
  taxa_no_show: number;
}

// Conta os agendamentos do período por status (Anexo A da EF: "Ocupação,
// Cancelamentos, No Show"). Desde a migration 008 (01/08/2026),
// "nao_compareceu" existe como status de verdade — ganhou botão dedicado na
// tela de Agenda ("Não compareceu"), separado de "cancelado" porque as duas
// coisas têm peso diferente para o negócio (um no-show ocupa a agenda sem
// aviso; um cancelamento pode ter sido feito com antecedência).
export async function getAgendaResumo(
  tenantId: string,
  inicio: Date,
  fim: Date
): Promise<AgendaResumo> {
  const grupos = await prisma.agendamento.groupBy({
    by: ["status"],
    where: { tenantId, dataHoraInicio: { gte: inicio, lte: fim } },
    _count: { _all: true },
    orderBy: { status: "asc" },
  });

  let agendados = 0;
  let concluidos = 0;
  let cancelados = 0;
  let naoCompareceu = 0;
  for (const g of grupos) {
    if (g.status === "agendado") agendados = g._count._all;
    else if (g.status === "concluido") concluidos = g._count._all;
    else if (g.status === "cancelado") cancelados = g._count._all;
    else if (g.status === "nao_compareceu") naoCompareceu = g._count._all;
  }
  const total = agendados + concluidos + cancelados + naoCompareceu;

  return {
    total,
    agendados,
    concluidos,
    cancelados,
    nao_compareceu: naoCompareceu,
    taxa_cancelamento: total > 0 ? round2((cancelados / total) * 100) : 0,
    taxa_no_show: total > 0 ? round2((naoCompareceu / total) * 100) : 0,
  };
}

export interface AgendaOcupada {
  minutos_ocupados: number;
  minutos_capacidade: number;
  percentual: number;
}

// Indicador "Agenda Ocupada" (tabela de indicadores solicitada em
// 01/08/2026). Ocupado = soma da duração real dos agendamentos que
// bloquearam a agenda no período (agendado + concluído + não compareceu —
// cancelado fica de fora porque, em geral, libera o horário). Capacidade =
// soma de profissionais.carga_horaria_semanal (ativos) convertida para
// minutos e escalada pela quantidade de semanas do período selecionado.
// Decisão explícita do usuário: cadastrar capacidade por profissional
// (migration 008) em vez de reaproveitar "Horas produtivas/mês" da
// Precificação, que é um número único por tenant.
export async function getAgendaOcupada(
  tenantId: string,
  inicio: Date,
  fim: Date
): Promise<AgendaOcupada> {
  const [agendamentos, profissionaisAtivos] = await Promise.all([
    prisma.agendamento.findMany({
      where: {
        tenantId,
        dataHoraInicio: { gte: inicio, lte: fim },
        status: { in: ["agendado", "concluido", "nao_compareceu"] },
      },
      select: { dataHoraInicio: true, dataHoraFim: true },
    }),
    prisma.profissional.findMany({
      where: { tenantId, ativo: true },
      select: { cargaHorariaSemanal: true },
    }),
  ]);

  const minutosOcupados = agendamentos.reduce(
    (acc: number, a: any) =>
      acc + (a.dataHoraFim.getTime() - a.dataHoraInicio.getTime()) / 60000,
    0
  );

  const diasNoPeriodo = Math.max(1, (fim.getTime() - inicio.getTime()) / 86400000);
  const semanas = diasNoPeriodo / 7;
  const minutosCapacidade =
    profissionaisAtivos.reduce((acc: number, p: any) => acc + Number(p.cargaHorariaSemanal) * 60, 0) *
    semanas;

  return {
    minutos_ocupados: Math.round(minutosOcupados),
    minutos_capacidade: Math.round(minutosCapacidade),
    percentual: minutosCapacidade > 0 ? round2((minutosOcupados / minutosCapacidade) * 100) : 0,
  };
}

export interface ClientesResumo {
  ativos: number;
  novos_periodo: number;
  inativos: number;
}

export async function getClientesResumo(
  tenantId: string,
  inicio: Date,
  fim: Date
): Promise<ClientesResumo> {
  const [ativos, novos, inativos] = await Promise.all([
    prisma.cliente.count({ where: { tenantId, ativo: true } }),
    prisma.cliente.count({ where: { tenantId, createdAt: { gte: inicio, lte: fim } } }),
    prisma.cliente.count({ where: { tenantId, ativo: false } }),
  ]);
  return { ativos, novos_periodo: novos, inativos };
}

export interface ServicoMaisVendido {
  servico_id: string;
  nome: string;
  quantidade: number;
  receita: number;
}

// Ranking de serviços por receita no período, a partir dos atendimentos
// já lançados no Caixa (Anexo A: "Serviços mais vendidos, Margem"). Margem
// por serviço não entra aqui porque exigiria custo médio por atendimento
// (custo_material do serviço já existe, mas não é copiado para o
// atendimento no momento do lançamento — ficaria inconsistente se o preço
// do serviço mudasse depois).
export async function getServicosMaisVendidos(
  tenantId: string,
  inicio: Date,
  fim: Date,
  limite = 5
): Promise<ServicoMaisVendido[]> {
  // Bug conhecido do Prisma Client (5.18.x): combinar _count + _sum num
  // groupBy faz o TS tentar unificar o tipo do argumento com "any[]" (erro
  // "is missing the following properties from type 'any[]': length, pop,
  // push..."), mesmo com orderBy presente. orderBy sozinho não resolve — já
  // tentamos (falhou de novo no deploy). O jeito de sair da roda-viva do
  // typechecker aqui é castar o argumento inteiro para "any": o Prisma em
  // runtime não liga para o tipo, só o compilador é que trava nessa
  // combinação específica de agregações.
  const grupos = (await prisma.atendimento.groupBy({
    by: ["servicoId"],
    where: { tenantId, dataAtendimento: { gte: inicio, lte: fim } },
    _count: { _all: true },
    _sum: { valorCobrado: true },
    orderBy: { servicoId: "asc" },
  } as any)) as any[];

  if (grupos.length === 0) return [];

  const servicos = (await prisma.servico.findMany({
    where: { id: { in: grupos.map((g) => g.servicoId) } },
    select: { id: true, nome: true },
  })) as any[];
  const nomePorId = new Map<string, string>(servicos.map((s) => [s.id, s.nome]));

  return grupos
    .map((g) => ({
      servico_id: g.servicoId,
      nome: nomePorId.get(g.servicoId) ?? "—",
      quantidade: g._count._all,
      receita: round2(Number(g._sum.valorCobrado ?? 0)),
    }))
    .sort((a, b) => b.receita - a.receita)
    .slice(0, limite);
}

// Janela do "mês corrente" (do dia 1 até agora) usada pelos indicadores da
// tabela solicitada em 01/08/2026 (Score Geral, Receita/Lucro do mês,
// Ticket Médio, Agenda Ocupada, Clientes Ativos, Cancelamentos, No Show) —
// deliberadamente independente do filtro de período do resto do Dashboard,
// porque esses indicadores formam um "resumo do mês" com cadência fixa
// (mesma lógica de calendário todo mês) e precisam de uma janela estável
// para comparar com o mês anterior no Score Geral.
export function calcularJanelaMesAtual(agora: Date = new Date()): { inicio: Date; fim: Date } {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
  return { inicio, fim: agora };
}

// Mesma quantidade de dias decorridos, mas no mês anterior — comparação
// "maçã com maçã". Comparar o mês em curso (ainda incompleto) com o mês
// anterior inteiro inflaria artificialmente uma queda só porque o mês não
// terminou.
export function calcularJanelaMesAnterior(agora: Date = new Date()): { inicio: Date; fim: Date } {
  const diaAtual = agora.getDate();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0, 0);
  const fim = new Date(agora.getFullYear(), agora.getMonth() - 1, diaAtual, 23, 59, 59, 999);
  return { inicio, fim };
}

export interface LucroMes {
  receita: number;
  comissoes: number;
  despesas: number;
  lucro: number;
}

// Despesas do mês (parte do indicador "Lucro do mês", tabela solicitada em
// 01/08/2026). Soma duas fontes independentes (sem risco de contar em
// dobro — não há vínculo entre elas no schema): saídas avulsas lançadas no
// Caixa (caixa_movimentos tipo="despesa") e contas a pagar já pagas no
// período (contas_pagar com status="paga", filtradas por data_pagamento —
// não por vencimento, porque o que importa para o lucro do mês é o que
// realmente saiu do caixa nele).
//
// Separada de getLucroDoMes (que existia antes como uma única função
// async) porque o Dashboard precisa dessa consulta rodando em paralelo com
// as outras no mesmo Promise.all — como ela antes só podia ser chamada
// depois de já ter a receita/comissão em mãos (resumoMes), virava uma
// segunda viagem ao banco em série, atrasando a página inteira sem
// necessidade (bug de performance real encontrado em produção em
// 01/08/2026 — navegação pela sidebar ficando perceptivelmente lenta depois
// que o Dashboard passou a rodar mais consultas). calcularLucroMes (abaixo)
// só faz a conta com o que já foi buscado, sem nova consulta.
export async function getDespesasDoMes(tenantId: string, inicio: Date, fim: Date): Promise<number> {
  const [movimentosDespesa, contasPagas] = await Promise.all([
    prisma.caixaMovimento.findMany({
      where: { tenantId, tipo: "despesa", dataMovimento: { gte: inicio, lte: fim } },
      select: { valor: true },
    }),
    prisma.contaPagar.findMany({
      where: { tenantId, status: "paga", dataPagamento: { gte: inicio, lte: fim } },
      select: { valor: true },
    }),
  ]);

  const despesasCaixa = (movimentosDespesa as any[]).reduce((acc, m) => acc + Number(m.valor), 0);
  const despesasContas = (contasPagas as any[]).reduce((acc, c) => acc + Number(c.valor), 0);
  return round2(despesasCaixa + despesasContas);
}

// Fórmula do "Lucro do mês" confirmada com o usuário: Receita − Comissões −
// Despesas. Pura/síncrona — recebe os três números já calculados (nenhum
// novo acesso ao banco), ver getDespesasDoMes acima para o porquê da
// separação.
export function calcularLucroMes(receita: number, comissoes: number, despesas: number): LucroMes {
  return {
    receita: round2(receita),
    comissoes: round2(comissoes),
    despesas: round2(despesas),
    lucro: round2(receita - comissoes - despesas),
  };
}

export interface ScoreGeral {
  valor: number;
  componentes: {
    ocupacao: number;
    cancelamento: number;
    no_show: number;
    tendencia_receita: number;
  };
}

// Indicador "Score Geral do Negócio" (tabela solicitada em 01/08/2026).
// Composição confirmada com o usuário: ocupação da agenda + cancelamento
// (invertido) + no-show (invertido) + tendência de receita vs. o mês
// anterior. É uma nota de 0 a 100 calculada por regra explícita — não é um
// modelo preditivo (a EF exclui ML avançado do escopo, Seção 3), então os
// pesos abaixo são uma escolha de produto, documentada aqui para poder ser
// ajustada depois sem virar caixa-preta:
//   - Ocupação (peso 35%): quanto mais perto de 100% ocupado, melhor,
//     limitada em 100 (superlotação não soma pontos extras).
//   - Cancelamento invertido (peso 20%): 100 − taxa×3 — no alerta existente
//     do Dashboard, 20% de cancelamento já é tratado como acima do
//     saudável; nessa curva 20% de cancelamento já derruba o componente
//     para 40 pontos.
//   - No-show invertido (peso 20%): 100 − taxa×5 — penalidade mais dura que
//     cancelamento, porque um no-show ocupa a agenda sem aviso nenhum.
//   - Tendência de receita (peso 25%): 50 pontos = receita estável; cada
//     ponto percentual de crescimento soma 1 ponto (e cada ponto de queda
//     tira 1), limitado entre 0 e 100.
export function calcularScoreGeral(params: {
  agendaOcupada: AgendaOcupada;
  agenda: AgendaResumo;
  receitaMesAtual: number;
  receitaMesAnterior: number;
}): ScoreGeral {
  const { agendaOcupada, agenda, receitaMesAtual, receitaMesAnterior } = params;

  const scoreOcupacao = Math.min(100, agendaOcupada.percentual);
  const scoreCancelamento = Math.max(0, 100 - agenda.taxa_cancelamento * 3);
  const scoreNoShow = Math.max(0, 100 - agenda.taxa_no_show * 5);

  const crescimentoPercentual =
    receitaMesAnterior > 0
      ? ((receitaMesAtual - receitaMesAnterior) / receitaMesAnterior) * 100
      : receitaMesAtual > 0
      ? 100
      : 0;
  const scoreTendencia = Math.max(0, Math.min(100, 50 + crescimentoPercentual));

  const valor = round2(
    scoreOcupacao * 0.35 + scoreCancelamento * 0.2 + scoreNoShow * 0.2 + scoreTendencia * 0.25
  );

  return {
    valor,
    componentes: {
      ocupacao: round2(scoreOcupacao),
      cancelamento: round2(scoreCancelamento),
      no_show: round2(scoreNoShow),
      tendencia_receita: round2(scoreTendencia),
    },
  };
}

// Bloco "Produtos" (estoque/catálogo) foi removido do Dashboard a pedido do
// usuário em 30/07/2026 — o sistema não rastreia estoque/giro de verdade, só
// tinha cadastro/valor de catálogo, e não fazia sentido manter esse
// indicador. Ver histórico do projeto se precisar recuperar.

export interface ContasVencidasResumo {
  pagar_qtd: number;
  pagar_total: number;
  receber_qtd: number;
  receber_total: number;
}

export async function getContasVencidasResumo(
  tenantId: string
): Promise<ContasVencidasResumo> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [pagar, receber] = (await Promise.all([
    prisma.contaPagar.findMany({
      where: { tenantId, status: "a_pagar", dataVencimento: { lt: hoje } },
      select: { valor: true },
    }),
    prisma.contaReceber.findMany({
      where: { tenantId, status: "a_receber", dataVencimento: { lt: hoje } },
      select: { valor: true },
    }),
  ])) as [any[], any[]];

  return {
    pagar_qtd: pagar.length,
    pagar_total: round2(pagar.reduce((acc, c) => acc + Number(c.valor), 0)),
    receber_qtd: receber.length,
    receber_total: round2(receber.reduce((acc, c) => acc + Number(c.valor), 0)),
  };
}

export interface Alerta {
  severidade: "alta" | "media";
  mensagem: string;
}

// Bloco "Alertas" da EF (Seção 6/13: "execução de alertas", "respeito às
// permissões"). Regras simples e explicáveis — contas vencidas, projeção
// de déficit e cancelamento acima do saudável — em vez de um motor de
// alertas configurável (fora do escopo desta fase).
export function gerarAlertas(params: {
  contasVencidas: ContasVencidasResumo;
  fluxoCaixa: FluxoCaixa | null;
  agenda: AgendaResumo;
  veFinanceiro: boolean;
}): Alerta[] {
  const { contasVencidas, fluxoCaixa, agenda, veFinanceiro } = params;
  const alertas: Alerta[] = [];

  if (veFinanceiro && contasVencidas.pagar_qtd > 0) {
    alertas.push({
      severidade: "alta",
      mensagem: `${contasVencidas.pagar_qtd} conta(s) a pagar vencida(s) — ${formatarMoeda(contasVencidas.pagar_total)} em atraso.`,
    });
  }

  if (veFinanceiro && contasVencidas.receber_qtd > 0) {
    alertas.push({
      severidade: "media",
      mensagem: `${contasVencidas.receber_qtd} conta(s) a receber vencida(s) — ${formatarMoeda(contasVencidas.receber_total)} em atraso.`,
    });
  }

  if (veFinanceiro && fluxoCaixa && fluxoCaixa.situacao === "deficit") {
    alertas.push({
      severidade: "alta",
      mensagem: `Déficit de caixa projetado de ${formatarMoeda(Math.abs(fluxoCaixa.saldo_final))} considerando o que está em aberto.`,
    });
  }

  if (agenda.total >= 5 && agenda.taxa_cancelamento >= 20) {
    alertas.push({
      severidade: "media",
      mensagem: `Taxa de cancelamento de ${agenda.taxa_cancelamento}% no período selecionado (acima de 20%).`,
    });
  }

  return alertas;
}

// Bloco "IA" da EF (Anexo A: "Insights e recomendações — Apoio à decisão").
// Frases descritivas geradas por regra a partir dos próprios indicadores já
// calculados — não é um modelo preditivo (a EF exclui ML avançado do
// escopo, Seção 3), é a mesma leitura que o dono faria olhando os números,
// só que já escrita.
export function gerarInsights(params: {
  resumoPeriodo: ResumoCaixa;
  servicosMaisVendidos: ServicoMaisVendido[];
  clientes: ClientesResumo;
}): string[] {
  const { resumoPeriodo, servicosMaisVendidos, clientes } = params;
  const insights: string[] = [];

  if (resumoPeriodo.por_profissional.length > 0 && resumoPeriodo.total_cobrado > 0) {
    const top = [...resumoPeriodo.por_profissional].sort(
      (a, b) => b.total_cobrado - a.total_cobrado
    )[0];
    const pct = round2((top.total_cobrado / resumoPeriodo.total_cobrado) * 100);
    insights.push(
      `${top.profissional_nome} é o profissional destaque do período, respondendo por ${pct}% da receita.`
    );
  }

  if (servicosMaisVendidos.length > 0) {
    const top = servicosMaisVendidos[0];
    insights.push(
      `"${top.nome}" foi o mais vendido do período, com ${top.quantidade} atendimento(s) e ${formatarMoeda(top.receita)} em receita.`
    );
  }

  if (clientes.novos_periodo > 0) {
    insights.push(`${clientes.novos_periodo} cliente(s) novo(s) cadastrado(s) no período selecionado.`);
  }

  if (insights.length === 0) {
    insights.push("Ainda não há dados suficientes no período selecionado para gerar insights.");
  }

  return insights;
}
