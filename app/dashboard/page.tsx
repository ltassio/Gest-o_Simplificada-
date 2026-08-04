import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { getResumoCaixa, type ResumoCaixa } from "@/lib/caixa";
import { getFluxoDeCaixa, type FluxoCaixa } from "@/lib/fluxoCaixa";
import { podeVerFinanceiro } from "@/lib/permissoes";
import {
  getAgendaResumo,
  getAgendaOcupada,
  getClientesResumo,
  getServicosMaisVendidos,
  getContasVencidasResumo,
  getDespesasDoMes,
  calcularLucroMes,
  calcularJanelaMesAtual,
  calcularJanelaMesAnterior,
  calcularScoreGeral,
  gerarAlertas,
  gerarInsights,
  type AgendaResumo,
  type AgendaOcupada,
  type ClientesResumo,
  type ServicoMaisVendido,
  type ContasVencidasResumo,
  type LucroMes,
  type ScoreGeral,
} from "@/lib/dashboard";
import FluxoCaixaChart from "./fluxo-caixa-chart";
import PeriodoFiltro from "./periodo-filtro";
import { AgendaChart, ClientesChart, ProfissionaisChart, ServicosChart } from "./indicador-charts";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PERIODO_LABEL: Record<string, string> = {
  mes_atual: "este mês",
  mes_anterior: "mês passado",
  "7_dias": "últimos 7 dias",
  "30_dias": "últimos 30 dias",
  personalizado: "período personalizado",
};

function formatarDataParaCampo(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function parseDataCampo(valor: string | undefined, fimDoDia: boolean): Date {
  if (valor) {
    const partes = valor.split("-").map(Number);
    if (partes.length === 3 && partes.every((n) => !Number.isNaN(n))) {
      const [ano, mes, dia] = partes;
      return fimDoDia
        ? new Date(ano, mes - 1, dia, 23, 59, 59, 999)
        : new Date(ano, mes - 1, dia, 0, 0, 0, 0);
    }
  }
  const hoje = new Date();
  if (fimDoDia) {
    hoje.setHours(23, 59, 59, 999);
  } else {
    hoje.setHours(0, 0, 0, 0);
  }
  return hoje;
}

function calcularPeriodo(
  periodo: string,
  agora: Date,
  inicioParam?: string,
  fimParam?: string
): { inicio: Date; fim: Date } {
  switch (periodo) {
    case "personalizado": {
      return { inicio: parseDataCampo(inicioParam, false), fim: parseDataCampo(fimParam, true) };
    }
    case "mes_anterior": {
      const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0);
      const fim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999);
      return { inicio, fim };
    }
    case "7_dias": {
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 6);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim: agora };
    }
    case "30_dias": {
      const inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 29);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim: agora };
    }
    case "mes_atual":
    default: {
      const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
      return { inicio, fim: agora };
    }
  }
}

function classeScore(valor: number): string {
  if (valor >= 70) return "score-bom";
  if (valor >= 40) return "score-medio";
  return "score-ruim";
}

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: { periodo?: string; inicio?: string; fim?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const periodoParam = searchParams?.periodo ?? "mes_atual";
  const periodoLabel = PERIODO_LABEL[periodoParam] ?? PERIODO_LABEL.mes_atual;

  const agora = new Date();
  const { inicio: inicioPeriodo, fim: fimPeriodo } = calcularPeriodo(
    periodoParam,
    agora,
    searchParams?.inicio,
    searchParams?.fim
  );
  const inicioAtual = formatarDataParaCampo(inicioPeriodo);
  const fimAtual = formatarDataParaCampo(fimPeriodo);
  const { inicio: inicioMes, fim: fimMes } = calcularJanelaMesAtual(agora);
  const { inicio: inicioMesAnterior, fim: fimMesAnterior } = calcularJanelaMesAnterior(agora);

  let resumoPeriodo: ResumoCaixa | null = null;
  let resumoMes: ResumoCaixa | null = null;
  let resumoMesAnterior: ResumoCaixa | null = null;
  let fluxoCaixa: FluxoCaixa | null = null;
  let agendaResumo: AgendaResumo | null = null;
  let agendaResumoMes: AgendaResumo | null = null;
  let agendaOcupada: AgendaOcupada | null = null;
  let clientesResumo: ClientesResumo | null = null;
  let servicosMaisVendidos: ServicoMaisVendido[] = [];
  let contasVencidas: ContasVencidasResumo | null = null;
  let lucroMes: LucroMes | null = null;
  let scoreGeral: ScoreGeral | null = null;
  let erro: string | null = null;
  let veFinanceiro = false;

  try {
    const meuPerfil = await getPerfilForUserId(user.id);
    veFinanceiro = podeVerFinanceiro(meuPerfil.papel);

    const [
      resumoPeriodoRes,
      resumoMesRes,
      resumoMesAnteriorRes,
      fluxoRes,
      agendaRes,
      agendaMesRes,
      agendaOcupadaRes,
      clientesRes,
      servicosRes,
      contasVencidasRes,
      despesasMesRes,
    ] = await Promise.all([
      getResumoCaixa(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getResumoCaixa(meuPerfil.tenantId, inicioMes, fimMes),
      getResumoCaixa(meuPerfil.tenantId, inicioMesAnterior, fimMesAnterior),
      veFinanceiro ? getFluxoDeCaixa(meuPerfil.tenantId) : Promise.resolve(null),
      getAgendaResumo(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getAgendaResumo(meuPerfil.tenantId, inicioMes, fimMes),
      getAgendaOcupada(meuPerfil.tenantId, inicioMes, fimMes),
      getClientesResumo(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getServicosMaisVendidos(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      veFinanceiro ? getContasVencidasResumo(meuPerfil.tenantId) : Promise.resolve(null),
      getDespesasDoMes(meuPerfil.tenantId, inicioMes, fimMes),
    ]);

    resumoPeriodo = resumoPeriodoRes;
    resumoMes = resumoMesRes;
    resumoMesAnterior = resumoMesAnteriorRes;
    fluxoCaixa = fluxoRes;
    agendaResumo = agendaRes;
    agendaResumoMes = agendaMesRes;
    agendaOcupada = agendaOcupadaRes;
    clientesResumo = clientesRes;
    servicosMaisVendidos = servicosRes;
    contasVencidas = contasVencidasRes;

    lucroMes = calcularLucroMes(resumoMes.total_cobrado, resumoMes.total_comissoes, despesasMesRes);

    scoreGeral = calcularScoreGeral({
      agendaOcupada,
      agenda: agendaResumoMes,
      receitaMesAtual: resumoMes.total_cobrado,
      receitaMesAnterior: resumoMesAnterior.total_cobrado,
    });
  } catch {
    erro = "Não foi possível carregar os indicadores agora.";
  }

  const alertas =
    !erro && agendaResumo
      ? gerarAlertas({
          contasVencidas: contasVencidas ?? { pagar_qtd: 0, pagar_total: 0, receber_qtd: 0, receber_total: 0 },
          fluxoCaixa,
          agenda: agendaResumo,
          veFinanceiro,
        })
      : [];

  const insights =
    !erro && resumoPeriodo && clientesResumo
      ? gerarInsights({
          resumoPeriodo,
          servicosMaisVendidos,
          clientes: clientesResumo,
        })
      : [];

  const ticketMedioMes =
    resumoMes && resumoMes.quantidade_atendimentos > 0
      ? resumoMes.total_cobrado / resumoMes.quantidade_atendimentos
      : 0;

  const rankingProfissionais = resumoPeriodo
    ? [...resumoPeriodo.por_profissional].sort((a, b) => b.total_cobrado - a.total_cobrado).slice(0, 5)
    : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>Dashboard Executivo</h1>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            Logado como <strong style={{ color: "var(--text)" }}>{user.email}</strong>
          </p>
        </div>
        <PeriodoFiltro valorAtual={periodoParam} inicioAtual={inicioAtual} fimAtual={fimAtual} />
      </div>

      {erro ? (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      ) : (
        <>
          {alertas.length > 0 && (
            <>
              <h2 className="section-title">
                <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: "var(--danger)" }} />
                Alertas
              </h2>
              <div className="alert-list">
                {alertas.map((a, i) => (
                  <div
                    key={i}
                    className={a.severidade === "alta" ? "alert-card alert-card-alta" : "alert-card alert-card-media"}
                  >
                    {a.mensagem}
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="section-title">Visão do mês</h2>
          <div className="split-grid">
            {scoreGeral && (
              <div className="score-card">
                <div className={`score-value ${classeScore(scoreGeral.valor)}`}>
                  {Math.round(scoreGeral.valor)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Score Geral do Negócio</div>
                  <div className="score-breakdown">
                    <span>Ocupação da agenda: {scoreGeral.componentes.ocupacao}/100</span>
                    <span>Cancelamento: {scoreGeral.componentes.cancelamento}/100</span>
                    <span>No-show: {scoreGeral.componentes.no_show}/100</span>
                    <span>Tendência de receita: {scoreGeral.componentes.tendencia_receita}/100</span>
                  </div>
                </div>
              </div>
            )}

            <div className="stat-card stat-card-hero section-accent section-accent-coral">
              <div className="stat-label">Receita do mês</div>
              <div className="stat-value stat-value-mono">{formatarMoeda(resumoMes?.total_cobrado ?? 0)}</div>
              <div className="hero-secondary-stats">
                <div>
                  <div className="hero-secondary-stat-label">Lucro do mês</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(lucroMes?.lucro ?? 0)}</div>
                </div>
                <div>
                  <div className="hero-secondary-stat-label">Ticket médio</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(ticketMedioMes)}</div>
                </div>
                <div>
                  <div className="hero-secondary-stat-label">Comissões a repassar</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(resumoMes?.total_comissoes ?? 0)}</div>
                </div>
                <div>
                  <div className="hero-secondary-stat-label">Despesas do mês</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(lucroMes?.despesas ?? 0)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Agenda Ocupada</div>
              <div className="stat-value stat-value-mono">{agendaOcupada?.percentual ?? 0}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Clientes Ativos</div>
              <div className="stat-value stat-value-mono">{clientesResumo?.ativos ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cancelamentos</div>
              <div className="stat-value stat-value-mono">{agendaResumoMes?.taxa_cancelamento ?? 0}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">No Show</div>
              <div className="stat-value stat-value-mono">{agendaResumoMes?.taxa_no_show ?? 0}%</div>
            </div>
          </div>

          {veFinanceiro && (
            <>
              <h2 className="section-title">
                <i className="ti ti-chart-line" aria-hidden="true" style={{ color: "var(--teal)" }} />
                Financeiro · Fluxo de caixa projetado (dia a dia)
              </h2>
              {fluxoCaixa ? (
                <div className="card section-accent section-accent-teal" style={{ padding: 20 }}>
                  <FluxoCaixaChart buckets={fluxoCaixa.buckets} />
                  <p
                    style={{
                      marginTop: 12,
                      marginBottom: 0,
                      fontSize: 14,
                      color: fluxoCaixa.situacao === "liquidez" ? "var(--success)" : "var(--danger)",
                      fontWeight: 600,
                    }}
                  >
                    {fluxoCaixa.situacao === "liquidez"
                      ? `Liquidez: sobra ${formatarMoeda(fluxoCaixa.saldo_final)} considerando o que está em aberto.`
                      : `Déficit projetado de ${formatarMoeda(Math.abs(fluxoCaixa.saldo_final))} — as contas a pagar em aberto superam as a receber.`}
                  </p>
                  <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    Projeção sobre o que está em aberto agora — não é filtrada pelo período selecionado acima.
                  </p>
                </div>
              ) : (
                <p className="empty-state">Sem dados de contas a pagar/receber ainda.</p>
              )}
            </>
          )}

          <h2 className="section-title">
            <i className="ti ti-users-group" aria-hidden="true" style={{ color: "var(--gold)" }} />
            Agenda e Clientes · {periodoLabel}
          </h2>
          <div className="split-grid">
            <div className="card section-accent section-accent-gold" style={{ padding: 20 }}>
              {agendaResumo ? (
                <AgendaChart resumo={agendaResumo} />
              ) : (
                <p className="empty-state">Nenhum agendamento no período selecionado.</p>
              )}
            </div>
            <div className="card section-accent section-accent-gold" style={{ padding: 20 }}>
              {clientesResumo ? (
                <ClientesChart resumo={clientesResumo} />
              ) : (
                <p className="empty-state">Sem dados de clientes ainda.</p>
              )}
            </div>
          </div>

          <h2 className="section-title">
            <i className="ti ti-users" aria-hidden="true" style={{ color: "var(--gold)" }} />
            Profissionais e Serviços · {periodoLabel}
          </h2>
          <div className="split-grid">
            <div className="card section-accent section-accent-gold" style={{ padding: 20 }}>
              <ProfissionaisChart ranking={rankingProfissionais} />
            </div>
            <div className="card section-accent section-accent-gold" style={{ padding: 20 }}>
              <ServicosChart servicos={servicosMaisVendidos} />
            </div>
          </div>

          <h2 className="section-title">
            <i className="ti ti-bulb" aria-hidden="true" style={{ color: "var(--accent)" }} />
            IA · Insights do período
          </h2>
          <div className="insight-list">
            {insights.map((texto, i) => (
              <div key={i} className="insight-item">
                {texto}
              </div>
            ))}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
            Gerado por regras simples sobre os indicadores acima — não é um modelo preditivo.
          </p>
        </>
      )}
    </div>
  );
}
