import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro } from "@/lib/permissoes";
import { getComparativoMensal } from "@/lib/relatorios";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarVariacao(pct: number | null) {
  if (pct === null) return "—";
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct}%`;
}

function corVariacao(pct: number | null) {
  if (pct === null) return "var(--text-muted)";
  return pct >= 0 ? "var(--success)" : "var(--danger)";
}

// Relatórios Gerenciais · Financeiro · Comparativo Mensal — pedido do
// usuário em 02/08/2026. Janela corrida dos últimos 12 meses (não
// calendário fechado), pra sempre incluir o mês corrente. Diferente de
// Evolução do Faturamento (só o gráfico de tendência da receita), aqui o
// foco é a comparação mês a mês: despesas, lucro e a variação percentual.
export default async function ComparativoMensalPage() {
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
        <h1 style={{ marginBottom: 6 }}>Comparativo Mensal</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const meses = await getComparativoMensal(meuPerfil.tenantId, 12);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Comparativo Mensal</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Últimos 12 meses, com variação percentual da receita sobre o mês anterior.
      </p>

      {meses.length === 0 ? (
        <p className="empty-state" style={{ marginTop: 20 }}>
          Ainda não há dados suficientes para montar o comparativo.
        </p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Receita</th>
                <th>Variação</th>
                <th>Despesas</th>
                <th>Lucro</th>
                <th>Ticket médio</th>
                <th>Atendimentos</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={`${m.ano}-${m.mes}`}>
                  <td>{m.label}</td>
                  <td>{formatarMoeda(m.receita)}</td>
                  <td style={{ color: corVariacao(m.variacao_receita_pct), fontWeight: 600 }}>
                    {formatarVariacao(m.variacao_receita_pct)}
                  </td>
                  <td>{formatarMoeda(m.despesas)}</td>
                  <td>{formatarMoeda(m.lucro)}</td>
                  <td>{formatarMoeda(m.ticket_medio)}</td>
                  <td>{m.qtd_atendimentos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
