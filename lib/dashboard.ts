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
  taxa_cancelamento: number;
}

// Conta os agendamentos do período por status (Anexo A da EF: "Ocupação,
// Cancelamentos, No Show"). "No Show" não existe como status hoje
// (agendamentos_status_check só aceita agendado/concluido/cancelado) —
// registrar isso exigiria uma migration e um novo botão na tela de Agenda,
// então por ora fica de fora em vez de ser simulado.
export async function getAgendaResumo(
  tenantId: string,
  inicio: Date,
  fim: Date
): Promise<AgendaResumo> {
  const grupos = await prisma.agendamento.groupBy({
    by: ["status"],
    where: { tenantId, dataHoraInicio: { gte: inicio, lte: fim } },
    _count: { _all: true },
  });

  let agendados = 0;
  let concluidos = 0;
  let cancelados = 0;
  for (const g of grupos) {
    if (g.status === "agendado") agendados = g._count._all;
    else if (g.status === "concluido") concluidos = g._count._all;
    else if (g.status === "cancelado") cancelados = g._count._all;
  }
  const total = agendados + concluidos + cancelados;

  return {
    total,
    agendados,
    concluidos,
    cancelados,
    taxa_cancelamento: total > 0 ? round2((cancelados / total) * 100) : 0,
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
  // Anotado como any[]: o retorno de groupBy tem um tipo condicional muito
  // aninhado e o TS às vezes falha em inferir os parâmetros dos .map/.sort
  // encadeados logo abaixo — mais simples anotar aqui do que reconstruir o
  // tipo à mão.
  const grupos: any[] = await prisma.atendimento.groupBy({
    by: ["servicoId"],
    where: { tenantId, dataAtendimento: { gte: inicio, lte: fim } },
    _count: { _all: true },
    _sum: { valorCobrado: true },
  });

  if (grupos.length === 0) return [];

  const servicos: any[] = await prisma.servico.findMany({
    where: { id: { in: grupos.map((g) => g.servicoId) } },
    select: { id: true, nome: true },
  });
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

export interface ProdutosResumo {
  cadastrados: number;
  valor_catalogo: number;
}

// Estoque e Giro (Anexo A) não têm campo de quantidade no cadastro de
// produtos hoje (migration 006 só adicionou o tipo 'produto' dentro de
// servicos) — mostrar isso exigiria modelar controle de estoque, que fica
// para uma fase futura. O que dá para mostrar com dado real é o catálogo.
export async function getProdutosResumo(tenantId: string): Promise<ProdutosResumo> {
  const produtos: any[] = await prisma.servico.findMany({
    where: { tenantId, tipo: "produto" },
    select: { preco: true },
  });
  return {
    cadastrados: produtos.length,
    valor_catalogo: round2(produtos.reduce((acc, p) => acc + Number(p.preco), 0)),
  };
}

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

  const [pagar, receber]: [any[], any[]] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { tenantId, status: "a_pagar", dataVencimento: { lt: hoje } },
      select: { valor: true },
    }),
    prisma.contaReceber.findMany({
      where: { tenantId, status: "a_receber", dataVencimento: { lt: hoje } },
      select: { valor: true },
    }),
  ]);

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
