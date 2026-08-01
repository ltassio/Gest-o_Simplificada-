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

// Formata uma Date como "YYYY-MM-DD" usando os componentes locais (mesma
// convenção de calcularPeriodo abaixo) — não usar toISOString() aqui, que
// converte pra UTC e pode devolver o dia errado dependendo do fuso do
// servidor.
function formatarDataParaInput(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const PERIODO_LABEL: Record<string, string> = {
  mes_atual: "este mês",
  mes_anterior: "mês passado",
  "7_dias": "últimos 7 dias",
  "30_dias": "últimos 30 dias",
};

function calcularPeriodo(
  periodo: string,
  agora: Date,
  personalizadoInicio?: string,
  personalizadoFim?: string
): { inicio: Date; fim: Date } {
  switch (periodo) {
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
    case "personalizado": {
      // Datas vêm dos query params "inicio"/"fim" (formato YYYY-MM-DD,
      // preenchidos pelo PeriodoFiltro). Se ainda não vieram ou vierem
      // inválidas (ex.: usuário acabou de trocar pra "Personalizado" antes
      // de escolher as datas), cai no mês atual como padrão sensato em vez
      // de quebrar a página.
      const inicioValido = personalizadoInicio ? new Date(`${personalizadoInicio}T00:00:00`) : null;
      const fimValido = personalizadoFim ? new Date(`${personalizadoFim}T23:59:59.999`) : null;
      if (
        inicioValido &&
        fimValido &&
        !isNaN(inicioValido.getTime()) &&
        !isNaN(fimValido.getTime()) &&
        inicioValido <= fimValido
      ) {
        return { inicio: inicioValido, fim: fimValido };
      }
      const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
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

// Dashboard Executivo (EF-001 — Dashboard Executivo e Business
// Intelligence, anexada pelo usuário em 30/07/2026). Redesenhado em
// 01/08/2026 a partir de um mockup aprovado pelo usuário, seguindo os
// princípios de staff-product-designer (uma ação/leitura primária por
// tela, cortar cards decorativos sem ação associada, poucas cores):
//   - Alertas sobem para logo depois do cabeçalho (o que precisa de atenção
//     agora vem antes de qualquer número "de passeio").
//   - "Visão do período" (renomeado de "Visão do mês" em 01/08/2026 — ver
//     comentário mais abaixo) traz os 8 indicadores pedidos pelo usuário em
//     01/08/2026 (Score Geral, Receita/Lucro, Ticket Médio, Agenda Ocupada,
//     Clientes Ativos, Cancelamentos, No Show).
//   - Os cards de "Contas vencidas" separados foram cortados — a mesma
//     informação já aparece em Alertas, manter os dois era redundante.
//   - Agenda+Clientes e Profissionais+Serviços passam a ficar lado a lado
//     (.split-grid) em vez de empilhados, para caber mais leitura na
//     mesma rolagem.
//   - Bloco "Marketing" (estático, "em breve") foi removido — não tinha
//     ação nem dado nenhum, só ocupava espaço.
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

  const agora = new Date();
  const { inicio: inicioPeriodo, fim: fimPeriodo } = calcularPeriodo(
    periodoParam,
    agora,
    searchParams?.inicio,
    searchParams?.fim
  );
  const { inicio: inicioMes, fim: fimMes } = calcularJanelaMesAtual(agora);
  const { inicio: inicioMesAnterior, fim: fimMesAnterior } = calcularJanelaMesAnterior(agora);

  const periodoLabel =
    periodoParam === "personalizado"
      ? `${inicioPeriodo.toLocaleDateString("pt-BR")} a ${fimPeriodo.toLocaleDateString("pt-BR")}`
      : PERIODO_LABEL[periodoParam] ?? PERIODO_LABEL.mes_atual;

  let resumoPeriodo: ResumoCaixa | null = null;
  let resumoMes: ResumoCaixa | null = null;
  let resumoMesAnterior: ResumoCaixa | null = null;
  let fluxoCaixa: FluxoCaixa | null = null;
  let agendaResumo: AgendaResumo | null = null;
  let agendaResumoMes: AgendaResumo | null = null;
  let agendaOcupadaPeriodo: AgendaOcupada | null = null;
  let agendaOcupadaMes: AgendaOcupada | null = null;
  let clientesResumo: ClientesResumo | null = null;
  let servicosMaisVendidos: ServicoMaisVendido[] = [];
  let contasVencidas: ContasVencidasResumo | null = null;
  let lucroPeriodo: LucroMes | null = null;
  let scoreGeral: ScoreGeral | null = null;
  let erro: string | null = null;
  let veFinanceiro = false;

  try {
    const meuPerfil = await getPerfilForUserId(user.id);
    veFinanceiro = podeVerFinanceiro(meuPerfil.papel);

    // getFluxoDeCaixa e os demais usam Prisma (conexão direta, não passa
    // por RLS), por isso o filtro por papel precisa ser feito aqui no
    // código — não dá para confiar só na política do banco quando o
    // acesso é via Prisma.
    //
    // Todas as consultas do Dashboard rodam num único Promise.all (bug de
    // performance real encontrado em produção em 01/08/2026 — clique na
    // sidebar demorando visivelmente mais depois que o Dashboard passou a
    // somar mais indicadores).
    //
    // Duas versões de Agenda Ocupada/Agenda Resumo rodam em paralelo desde
    // 01/08/2026: uma pro período selecionado no filtro do topo (alimenta
    // os cards de "Visão do período" e o gráfico de Agenda) e outra sempre
    // fixa no mês corrente/anterior (alimenta só o Score Geral). Isso é
    // proposital, não duplicação por engano — decisão confirmada com o
    // usuário: os cards de "Visão do período" devem seguir o filtro
    // (inclusive a nova opção "Personalizado"), mas o Score Geral precisa
    // de uma janela estável de calendário pra comparação "mês atual vs mês
    // anterior" continuar fazendo sentido — se ele também seguisse um
    // período arbitrário, a "tendência de receita" que compõe o score
    // deixaria de ter um "anterior" claro pra comparar.
    const [
      resumoPeriodoRes,
      resumoMesRes,
      resumoMesAnteriorRes,
      fluxoRes,
      agendaRes,
      agendaMesRes,
      agendaOcupadaPeriodoRes,
      agendaOcupadaMesRes,
      clientesRes,
      servicosRes,
      contasVencidasRes,
      despesasPeriodoRes,
    ] = await Promise.all([
      getResumoCaixa(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getResumoCaixa(meuPerfil.tenantId, inicioMes, fimMes),
      getResumoCaixa(meuPerfil.tenantId, inicioMesAnterior, fimMesAnterior),
      veFinanceiro ? getFluxoDeCaixa(meuPerfil.tenantId) : Promise.resolve(null),
      getAgendaResumo(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getAgendaResumo(meuPerfil.tenantId, inicioMes, fimMes),
      getAgendaOcupada(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getAgendaOcupada(meuPerfil.tenantId, inicioMes, fimMes),
      getClientesResumo(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getServicosMaisVendidos(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      veFinanceiro ? getContasVencidasResumo(meuPerfil.tenantId) : Promise.resolve(null),
      getDespesasDoMes(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
    ]);

    resumoPeriodo = resumoPeriodoRes;
    resumoMes = resumoMesRes;
    resumoMesAnterior = resumoMesAnteriorRes;
    fluxoCaixa = fluxoRes;
    agendaResumo = agendaRes;
    agendaResumoMes = agendaMesRes;
    agendaOcupadaPeriodo = agendaOcupadaPeriodoRes;
    agendaOcupadaMes = agendaOcupadaMesRes;
    clientesResumo = clientesRes;
    servicosMaisVendidos = servicosRes;
    contasVencidas = contasVencidasRes;

    // Lucro/Receita/Ticket médio/Comissões/Despesas de "Visão do período"
    // agora seguem o período selecionado (resumoPeriodo), não mais o mês
    // corrente fixo — é a mudança pedida pelo usuário em 01/08/2026 pra
    // fazer sentido escolher "Mês passado" ou um período personalizado e
    // ver esses números mudarem.
    lucroPeriodo = calcularLucroMes(
      resumoPeriodo.total_cobrado,
      resumoPeriodo.total_comissoes,
      despesasPeriodoRes
    );

    // Score Geral continua fixo em mês atual vs mês anterior, de propósito
    // (ver comentário acima do Promise.all).
    scoreGeral = calcularScoreGeral({
      agendaOcupada: agendaOcupadaMes,
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

  const ticketMedioPeriodo =
    resumoPeriodo && resumoPeriodo.quantidade_atendimentos > 0
      ? resumoPeriodo.total_cobrado / resumoPeriodo.quantidade_atendimentos
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
        <PeriodoFiltro
          valorAtual={periodoParam}
          inicioAtual={formatarDataParaInput(inicioPeriodo)}
          fimAtual={formatarDataParaInput(fimPeriodo)}
        />
      </div>

      {erro ? (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      ) : (
        <>
          {/* Bloco: Alertas — logo após o cabeçalho, antes de qualquer
              número "de passeio" (redesenho de 01/08/2026). */}
          {alertas.length > 0 && (
            <>
              <h2 className="section-title">Alertas</h2>
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

          {/* Bloco: Visão do período — os 8 indicadores pedidos em
              01/08/2026. Até 01/08/2026 esse bloco era sempre fixo no mês
              corrente, independente do filtro do topo; a partir de agora
              segue o período selecionado (inclusive "Personalizado"),
              exceto o Score Geral, que continua comparando sempre mês
              atual vs mês anterior (ver comentário no Promise.all acima). */}
          <h2 className="section-title">Visão do período · {periodoLabel}</h2>
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
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
                    Sempre compara mês atual vs mês anterior — não muda com o filtro de período acima.
                  </p>
                </div>
              </div>
            )}

            <div className="stat-card stat-card-hero">
              <div className="stat-label">Receita do período</div>
              <div className="stat-value">{formatarMoeda(resumoPeriodo?.total_cobrado ?? 0)}</div>
              <div className="hero-secondary-stats">
                <div>
                  <div className="hero-secondary-stat-label">Lucro do período</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(lucroPeriodo?.lucro ?? 0)}</div>
                </div>
                <div>
                  <div className="hero-secondary-stat-label">Ticket médio</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(ticketMedioPeriodo)}</div>
                </div>
                <div>
                  <div className="hero-secondary-stat-label">Comissões a repassar</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(resumoPeriodo?.total_comissoes ?? 0)}</div>
                </div>
                <div>
                  <div className="hero-secondary-stat-label">Despesas do período</div>
                  <div className="hero-secondary-stat-value">{formatarMoeda(lucroPeriodo?.despesas ?? 0)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Agenda Ocupada</div>
              <div className="stat-value">{agendaOcupadaPeriodo?.percentual ?? 0}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Clientes Ativos</div>
              <div className="stat-value">{clientesResumo?.ativos ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cancelamentos</div>
              <div className="stat-value">{agendaResumo?.taxa_cancelamento ?? 0}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">No Show</div>
              <div className="stat-value">{agendaResumo?.taxa_no_show ?? 0}%</div>
            </div>
          </div>

          {/* Bloco: Financeiro */}
          {veFinanceiro && (
            <>
              <h2 className="section-title">Financeiro · Fluxo de caixa projetado (dia a dia)</h2>
              {fluxoCaixa ? (
                <div className="card" style={{ padding: 20 }}>
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

          {/* Bloco: Agenda + Clientes lado a lado */}
          <h2 className="section-title">Agenda e Clientes · {periodoLabel}</h2>
          <div className="split-grid">
            <div className="card" style={{ padding: 20 }}>
              {agendaResumo ? (
                <AgendaChart resumo={agendaResumo} />
              ) : (
                <p className="empty-state">Nenhum agendamento no período selecionado.</p>
              )}
            </div>
            <div className="card" style={{ padding: 20 }}>
              {clientesResumo ? (
                <ClientesChart resumo={clientesResumo} />
              ) : (
                <p className="empty-state">Sem dados de clientes ainda.</p>
              )}
            </div>
          </div>

          {/* Bloco: Profissionais + Serviços lado a lado */}
          <h2 className="section-title">Profissionais e Serviços · {periodoLabel}</h2>
          <div className="split-grid">
            <div className="card" style={{ padding: 20 }}>
              <ProfissionaisChart ranking={rankingProfissionais} />
            </div>
            <div className="card" style={{ padding: 20 }}>
              <ServicosChart servicos={servicosMaisVendidos} />
            </div>
          </div>

          {/* Bloco: IA */}
          <h2 className="section-title">IA · Insights do período</h2>
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
