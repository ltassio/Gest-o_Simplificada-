import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { getResumoCaixa, type ResumoCaixa } from "@/lib/caixa";
import { getFluxoDeCaixa, type FluxoCaixa } from "@/lib/fluxoCaixa";
import { podeVerFinanceiro } from "@/lib/permissoes";
import {
  getAgendaResumo,
  getClientesResumo,
  getServicosMaisVendidos,
  getContasVencidasResumo,
  gerarAlertas,
  gerarInsights,
  type AgendaResumo,
  type ClientesResumo,
  type ServicoMaisVendido,
  type ContasVencidasResumo,
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
};

function calcularPeriodo(periodo: string, agora: Date): { inicio: Date; fim: Date } {
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
    case "mes_atual":
    default: {
      const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
      return { inicio, fim: agora };
    }
  }
}

// Dashboard Executivo (EF-001 — Dashboard Executivo e Business
// Intelligence, anexada pelo usuário em 30/07/2026). Reestruturado em
// blocos seguindo a Seção 6 da EF (Saúde do Negócio, Financeiro, Agenda,
// Clientes, Profissionais, Serviços, Marketing, IA e Alertas). Bloco
// "Produtos" (catálogo/estoque) foi removido a pedido do usuário — ver
// comentário em lib/dashboard.ts. Agenda, Clientes, Profissionais e
// Serviços viram gráficos (recharts, ver ./indicador-charts.tsx) em vez de
// cards de número/tabela, também a pedido do usuário.
// Marketing e IA preditiva não têm fonte de dado no sistema hoje (não há
// rastreio de origem/CAC nem modelo de ML — a própria EF exclui "Machine
// Learning avançado" do escopo, Seção 3) e ficam como blocos "em breve" /
// insights por regra simples, ver lib/dashboard.ts.
export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: { periodo?: string };
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
  const { inicio: inicioPeriodo, fim: fimPeriodo } = calcularPeriodo(periodoParam, agora);
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);

  let resumoPeriodo: ResumoCaixa | null = null;
  let resumoHoje: ResumoCaixa | null = null;
  let fluxoCaixa: FluxoCaixa | null = null;
  let agendaResumo: AgendaResumo | null = null;
  let clientesResumo: ClientesResumo | null = null;
  let servicosMaisVendidos: ServicoMaisVendido[] = [];
  let contasVencidas: ContasVencidasResumo | null = null;
  let erro: string | null = null;
  let veFinanceiro = false;

  try {
    const meuPerfil = await getPerfilForUserId(user.id);
    veFinanceiro = podeVerFinanceiro(meuPerfil.papel);

    // getFluxoDeCaixa e os demais usam Prisma (conexão direta, não passa
    // por RLS), por isso o filtro por papel precisa ser feito aqui no
    // código — não dá para confiar só na política do banco quando o
    // acesso é via Prisma.
    const [
      resumoPeriodoRes,
      resumoHojeRes,
      fluxoRes,
      agendaRes,
      clientesRes,
      servicosRes,
      contasVencidasRes,
    ] = await Promise.all([
      getResumoCaixa(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getResumoCaixa(meuPerfil.tenantId, inicioHoje, fimHoje),
      veFinanceiro ? getFluxoDeCaixa(meuPerfil.tenantId) : Promise.resolve(null),
      getAgendaResumo(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getClientesResumo(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      getServicosMaisVendidos(meuPerfil.tenantId, inicioPeriodo, fimPeriodo),
      veFinanceiro ? getContasVencidasResumo(meuPerfil.tenantId) : Promise.resolve(null),
    ]);

    resumoPeriodo = resumoPeriodoRes;
    resumoHoje = resumoHojeRes;
    fluxoCaixa = fluxoRes;
    agendaResumo = agendaRes;
    clientesResumo = clientesRes;
    servicosMaisVendidos = servicosRes;
    contasVencidas = contasVencidasRes;
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

  const ticketMedio =
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
        <PeriodoFiltro valorAtual={periodoParam} />
      </div>

      {erro ? (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      ) : (
        <>
          {/* Bloco: Saúde do Negócio */}
          <h2 className="section-title">Saúde do Negócio · {periodoLabel}</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Receita no período</div>
              <div className="stat-value">{formatarMoeda(resumoPeriodo?.total_cobrado ?? 0)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Ticket médio</div>
              <div className="stat-value">{formatarMoeda(ticketMedio)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Comissões a repassar</div>
              <div className="stat-value">{formatarMoeda(resumoPeriodo?.total_comissoes ?? 0)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Fica para o estúdio</div>
              <div className="stat-value">{formatarMoeda(resumoPeriodo?.total_estudio ?? 0)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Atendimentos hoje</div>
              <div className="stat-value">{resumoHoje?.quantidade_atendimentos ?? 0}</div>
            </div>
          </div>

          {/* Bloco: Alertas */}
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

          {/* Bloco: Financeiro */}
          {veFinanceiro && (
            <>
              <h2 className="section-title">Financeiro</h2>
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="stat-label">Contas a pagar vencidas</div>
                  <div className="stat-value">{contasVencidas?.pagar_qtd ?? 0}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                    {formatarMoeda(contasVencidas?.pagar_total ?? 0)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Contas a receber vencidas</div>
                  <div className="stat-value">{contasVencidas?.receber_qtd ?? 0}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                    {formatarMoeda(contasVencidas?.receber_total ?? 0)}
                  </div>
                </div>
              </div>
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

          {/* Bloco: Agenda */}
          <h2 className="section-title">Agenda · {periodoLabel}</h2>
          <div className="card" style={{ padding: 20 }}>
            {agendaResumo ? (
              <AgendaChart resumo={agendaResumo} />
            ) : (
              <p className="empty-state">Nenhum agendamento no período selecionado.</p>
            )}
          </div>

          {/* Bloco: Clientes */}
          <h2 className="section-title">Clientes</h2>
          <div className="card" style={{ padding: 20 }}>
            {clientesResumo ? (
              <ClientesChart resumo={clientesResumo} />
            ) : (
              <p className="empty-state">Sem dados de clientes ainda.</p>
            )}
          </div>

          {/* Bloco: Profissionais */}
          <h2 className="section-title">Profissionais · Ranking do período</h2>
          <div className="card" style={{ padding: 20 }}>
            <ProfissionaisChart ranking={rankingProfissionais} />
          </div>

          {/* Bloco: Serviços */}
          <h2 className="section-title">Serviços · Mais vendidos no período</h2>
          <div className="card" style={{ padding: 20 }}>
            <ServicosChart servicos={servicosMaisVendidos} />
          </div>

          {/* Bloco: Marketing */}
          <h2 className="section-title">Marketing</h2>
          <div className="card coming-soon-card">
            <p style={{ margin: 0 }}>
              Origem de clientes, CAC e ROI de campanhas ainda não têm fonte de dado no sistema — nenhuma tela
              registra canal de aquisição ou investimento em marketing hoje. Bloco reservado para uma fase futura.
            </p>
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
