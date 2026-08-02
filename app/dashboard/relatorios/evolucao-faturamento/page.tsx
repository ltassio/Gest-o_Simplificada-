import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro } from "@/lib/permissoes";
import { getEvolucaoFaturamento } from "@/lib/relatorios";
import EvolucaoFaturamentoChart from "./evolucao-faturamento-chart";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarVariacao(pct: number | null) {
  if (pct === null) return "—";
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct}%`;
}

// Relatórios Gerenciais · Financeiro · Evolução do Faturamento — pedido do
// usuário em 02/08/2026. Só a tendência da receita (linha), últimos 12
// meses — comparação mês a mês com despesas/lucro já mora em Comparativo
// Mensal, pra não duplicar a mesma tabela em dois lugares.
export default async function EvolucaoFaturamentoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meuPerfil = await getPerfilForUserId(user.id);

  if (!podeVerFinanceiro(meuPerfil.papel)) {
    return (
      <div>
        <h1 style={{ marginBottom: 6 }}>Evolução do Faturamento</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const evolucao = await getEvolucaoFaturamento(meuPerfil.tenantId, 12);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Evolução do Faturamento</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Receita mês a mês nos últimos 12 meses.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Receita média mensal</div>
          <div className="stat-value">{formatarMoeda(evolucao.receita_media_mensal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Variação no período (12 meses)</div>
          <div
            className="stat-value"
            style={{
              color:
                evolucao.variacao_total_pct === null
                  ? "var(--text)"
                  : evolucao.variacao_total_pct >= 0
                  ? "var(--success)"
                  : "var(--danger)",
            }}
          >
            {formatarVariacao(evolucao.variacao_total_pct)}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <EvolucaoFaturamentoChart pontos={evolucao.pontos} />
      </div>
    </div>
  );
}
