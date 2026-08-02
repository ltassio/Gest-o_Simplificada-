import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro } from "@/lib/permissoes";
import { getEvolucaoClientes } from "@/lib/relatorios";
import EvolucaoClientesChart from "./evolucao-clientes-chart";

// Relatórios Gerenciais · Clientes · Evolução de Clientes — pedido do
// usuário em 02/08/2026. Novos cadastros por mês (últimos 12 meses) + total
// acumulado. Ativos/Inativos aparecem como totais atuais (não como série no
// tempo) porque o schema não guarda histórico de quando um cliente foi
// desativado — ver comentário em lib/relatorios.ts (getEvolucaoClientes).
export default async function EvolucaoClientesPage() {
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
        <h1 style={{ marginBottom: 6 }}>Evolução de Clientes</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const evolucao = await getEvolucaoClientes(meuPerfil.tenantId, 12);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Evolução de Clientes</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Novos cadastros por mês e crescimento acumulado da base de clientes.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Clientes ativos</div>
          <div className="stat-value">{evolucao.total_ativos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clientes inativos</div>
          <div className="stat-value">{evolucao.total_inativos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Novos no último mês</div>
          <div className="stat-value">{evolucao.novos_ultimo_mes}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <EvolucaoClientesChart pontos={evolucao.pontos} />
      </div>
    </div>
  );
}
