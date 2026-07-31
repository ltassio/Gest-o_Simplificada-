import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { getResumoCaixa } from "@/lib/caixa";
import { getFluxoDeCaixa, type FluxoCaixa } from "@/lib/fluxoCaixa";
import { podeVerFinanceiro } from "@/lib/permissoes";
import FluxoCaixaChart from "./fluxo-caixa-chart";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Dashboard do MVP (Documento de Visão do Produto v2.0, Seção 6):
// faturamento do mês, comissões a repassar e atendimentos do dia. Roda
// como Server Component e chama getResumoCaixa diretamente (mesmo
// processo, via Prisma) em vez de ir até a própria API Route por HTTP —
// mais simples e não exige lidar com um Bearer token aqui.
export default async function DashboardHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);

  let resumoMes = null;
  let resumoHoje = null;
  let fluxoCaixa: FluxoCaixa | null = null;
  let erro: string | null = null;
  let veFinanceiro = false;

  try {
    const meuPerfil = await getPerfilForUserId(user.id);
    veFinanceiro = podeVerFinanceiro(meuPerfil.papel);

    // getFluxoDeCaixa usa Prisma (conexão direta, não passa por RLS), por
    // isso o filtro por papel precisa ser feito aqui no código — não dá
    // para confiar só na política do banco quando o acesso é via Prisma.
    const [resumo1, resumo2, fluxo] = await Promise.all([
      getResumoCaixa(meuPerfil.tenantId, inicioMes, agora),
      getResumoCaixa(meuPerfil.tenantId, inicioHoje, fimHoje),
      veFinanceiro ? getFluxoDeCaixa(meuPerfil.tenantId) : Promise.resolve(null),
    ]);
    resumoMes = resumo1;
    resumoHoje = resumo2;
    fluxoCaixa = fluxo;
  } catch {
    erro = "Não foi possível carregar os indicadores agora.";
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Bem-vindo(a)</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Logado como <strong style={{ color: "var(--text)" }}>{user.email}</strong>
      </p>

      {erro ? (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      ) : (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Faturamento do mês</div>
            <div className="stat-value">{formatarMoeda(resumoMes?.total_cobrado ?? 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Comissões a repassar</div>
            <div className="stat-value">{formatarMoeda(resumoMes?.total_comissoes ?? 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Fica para o estúdio</div>
            <div className="stat-value">{formatarMoeda(resumoMes?.total_estudio ?? 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Atendimentos hoje</div>
            <div className="stat-value">{resumoHoje?.quantidade_atendimentos ?? 0}</div>
          </div>
        </div>
      )}

      {veFinanceiro && (
        <>
          <h2 className="section-title">Fluxo de caixa projetado</h2>
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
            </div>
          ) : (
            <p className="empty-state">Sem dados de contas a pagar/receber ainda.</p>
          )}
        </>
      )}
    </div>
  );
}
