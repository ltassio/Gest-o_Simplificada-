import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { getFluxoDeCaixa } from "@/lib/fluxoCaixa";
import { podeVerFinanceiro } from "@/lib/permissoes";
import FluxoCaixaChart from "../../fluxo-caixa-chart";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Página dedicada de Fluxo de Caixa (módulo Financeiro, Fase 1) — mesma
// projeção que aparece resumida no Dashboard, aqui com mais espaço e como
// item próprio do menu Financeiro, como pedido.
export default async function FluxoCaixaPage() {
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
        <h1 style={{ marginBottom: 6 }}>Fluxo de Caixa</h1>
        <p className="alert-error">Seu papel de acesso não inclui o módulo Financeiro.</p>
      </div>
    );
  }

  const fluxoCaixa = await getFluxoDeCaixa(meuPerfil.tenantId);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Fluxo de Caixa</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Projeção do que está em aberto em Contas a Pagar e Contas a Receber, por faixa de vencimento.
      </p>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
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

      <div className="stat-grid" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total a pagar em aberto</div>
          <div className="stat-value">{formatarMoeda(fluxoCaixa.total_a_pagar_aberto)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total a receber em aberto</div>
          <div className="stat-value">{formatarMoeda(fluxoCaixa.total_a_receber_aberto)}</div>
        </div>
      </div>
    </div>
  );
}
