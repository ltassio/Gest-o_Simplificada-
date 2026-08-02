import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro } from "@/lib/permissoes";
import { getClientesDevedores } from "@/lib/relatorios";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

// Relatórios Gerenciais · Clientes · Clientes Devedores — pedido do usuário
// em 02/08/2026. Contas a Receber ainda em aberto (status "a_receber"),
// agrupadas por cliente — "vencida" é sempre derivado (nunca gravado como
// status, mesma regra do Fluxo de Caixa: conta em aberto com vencimento no
// passado).
export default async function ClientesDevedoresPage() {
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
        <h1 style={{ marginBottom: 6 }}>Clientes Devedores</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const resumo = await getClientesDevedores(meuPerfil.tenantId);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Clientes Devedores</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Contas a Receber ainda em aberto, por cliente.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total em aberto</div>
          <div className="stat-value">{formatarMoeda(resumo.total_geral)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total vencido</div>
          <div className="stat-value" style={{ color: resumo.total_vencido_geral > 0 ? "var(--danger)" : "var(--text)" }}>
            {formatarMoeda(resumo.total_vencido_geral)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clientes devedores</div>
          <div className="stat-value">{resumo.clientes.length}</div>
        </div>
      </div>

      <h2 className="section-title">Detalhamento por cliente</h2>
      {resumo.clientes.length === 0 ? (
        <p className="empty-state">Nenhuma conta a receber em aberto no momento.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Total devido</th>
                <th>Contas em aberto</th>
                <th>Vencidas</th>
                <th>Total vencido</th>
                <th>Maior atraso</th>
                <th>Próximo vencimento</th>
              </tr>
            </thead>
            <tbody>
              {resumo.clientes.map((c) => (
                <tr key={c.cliente_id}>
                  <td>{c.nome}</td>
                  <td>{c.telefone ?? "-"}</td>
                  <td>{formatarMoeda(c.total_devido)}</td>
                  <td>{c.qtd_contas}</td>
                  <td>
                    {c.qtd_vencidas > 0 ? (
                      <span className="badge badge-danger">{c.qtd_vencidas}</span>
                    ) : (
                      <span className="badge">0</span>
                    )}
                  </td>
                  <td>{c.total_vencido > 0 ? formatarMoeda(c.total_vencido) : "-"}</td>
                  <td>{c.dias_atraso_max > 0 ? `${c.dias_atraso_max} dia(s)` : "-"}</td>
                  <td>{c.proximo_vencimento ? formatarData(c.proximo_vencimento) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
