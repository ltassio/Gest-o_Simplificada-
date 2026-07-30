import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Bem-vindo(a)</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Logado como <strong style={{ color: "var(--text)" }}>{user?.email}</strong>
      </p>

      <div className="tile-grid">
        <Link href="/dashboard/agenda" className="tile">
          <div className="tile-title">Agenda</div>
          <div className="tile-desc">Ver e criar agendamentos do dia</div>
        </Link>
        <Link href="/dashboard/clientes" className="tile">
          <div className="tile-title">Clientes</div>
          <div className="tile-desc">Consultar e cadastrar clientes</div>
        </Link>
      </div>
    </div>
  );
}
