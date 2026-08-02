import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro } from "@/lib/permissoes";
import { getComparativoAnual } from "@/lib/relatorios";

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

// Relatórios Gerenciais · Financeiro · Comparativo Anual — pedido do
// usuário em 02/08/2026. Um ano por linha, do primeiro ano com dado até o
// ano atual (que entra parcial, só até hoje).
export default async function ComparativoAnualPage() {
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
        <h1 style={{ marginBottom: 6 }}>Comparativo Anual</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const anos = await getComparativoAnual(meuPerfil.tenantId);
  const anoAtual = new Date().getFullYear();

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Comparativo Anual</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Receita, despesas e lucro ano a ano, com variação percentual da receita sobre o ano anterior.
      </p>

      {anos.length === 0 ? (
        <p className="empty-state" style={{ marginTop: 20 }}>
          Ainda não há dados suficientes para montar o comparativo.
        </p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ano</th>
                <th>Receita</th>
                <th>Variação</th>
                <th>Comissões</th>
                <th>Despesas</th>
                <th>Lucro</th>
                <th>Ticket médio</th>
                <th>Clientes novos</th>
              </tr>
            </thead>
            <tbody>
              {anos.map((a) => (
                <tr key={a.ano}>
                  <td>
                    {a.ano}
                    {a.ano === anoAtual && (
                      <span className="badge badge-accent" style={{ marginLeft: 8 }}>
                        em andamento
                      </span>
                    )}
                  </td>
                  <td>{formatarMoeda(a.receita)}</td>
                  <td style={{ color: corVariacao(a.variacao_receita_pct), fontWeight: 600 }}>
                    {formatarVariacao(a.variacao_receita_pct)}
                  </td>
                  <td>{formatarMoeda(a.comissoes)}</td>
                  <td>{formatarMoeda(a.despesas)}</td>
                  <td>{formatarMoeda(a.lucro)}</td>
                  <td>{formatarMoeda(a.ticket_medio)}</td>
                  <td>{a.clientes_novos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
        O ano em andamento entra com dado só até hoje — comparar com anos fechados tende a mostrar
        variação negativa mesmo que o ritmo esteja igual ou melhor.
      </p>
    </div>
  );
}
