import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro } from "@/lib/permissoes";
import { getLtv } from "@/lib/relatorios";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

// Relatórios Gerenciais · Financeiro · LTV (Lifetime Value) — pedido do
// usuário em 02/08/2026. Ver fórmula adotada e a justificativa em
// lib/relatorios.ts (getLtv): soma histórica de tudo que o cliente já
// pagou em atendimentos, média entre clientes com pelo menos 1 atendimento.
export default async function LtvPage() {
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
        <h1 style={{ marginBottom: 6 }}>LTV (Lifetime Value)</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const ltv = await getLtv(meuPerfil.tenantId);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>LTV (Lifetime Value)</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Quanto cada cliente já rendeu em receita, desde o primeiro até o último atendimento registrado.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">LTV médio</div>
          <div className="stat-value">{formatarMoeda(ltv.ltv_medio)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ticket médio geral</div>
          <div className="stat-value">{formatarMoeda(ltv.ticket_medio_geral)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Frequência média</div>
          <div className="stat-value">{ltv.frequencia_media}x</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clientes com histórico</div>
          <div className="stat-value">{ltv.clientes_considerados}</div>
        </div>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
        Frequência média = total de atendimentos ÷ clientes com histórico. LTV médio = receita
        total ÷ clientes com histórico (só entram clientes com pelo menos 1 atendimento lançado).
      </p>

      <h2 className="section-title">Ranking por LTV individual</h2>
      {ltv.clientes.length === 0 ? (
        <p className="empty-state">Nenhum atendimento lançado ainda.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>LTV (receita total)</th>
                <th>Atendimentos</th>
                <th>Ticket médio</th>
                <th>Primeiro atendimento</th>
                <th>Último atendimento</th>
                <th>Relacionamento</th>
              </tr>
            </thead>
            <tbody>
              {ltv.clientes.map((c) => (
                <tr key={c.cliente_id}>
                  <td>{c.nome}</td>
                  <td>{formatarMoeda(c.receita_total)}</td>
                  <td>{c.qtd_atendimentos}</td>
                  <td>{formatarMoeda(c.ticket_medio)}</td>
                  <td>{formatarData(c.primeiro_atendimento)}</td>
                  <td>{formatarData(c.ultimo_atendimento)}</td>
                  <td>{c.meses_relacionamento} {c.meses_relacionamento === 1 ? "mês" : "meses"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
