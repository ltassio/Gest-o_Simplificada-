import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Segunda camada de proteção (além do middleware): se por algum motivo
  // chegar aqui sem sessão, manda para o login em vez de renderizar a página.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="dashboard-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="dot" />
          <span>Gestão Simples</span>
        </div>

        <Link href="/dashboard" className="sidebar-link">
          Início
        </Link>
        <Link href="/dashboard/agenda" className="sidebar-link">
          Agenda
        </Link>
        <Link href="/dashboard/caixa" className="sidebar-link">
          Caixa
        </Link>
        <Link href="/dashboard/clientes" className="sidebar-link">
          Clientes
        </Link>
        <Link href="/dashboard/servicos" className="sidebar-link">
          Serviços
        </Link>
        <Link href="/dashboard/profissionais" className="sidebar-link">
          Profissionais
        </Link>
        <Link href="/dashboard/precificacao" className="sidebar-link">
          Precificação
        </Link>

        <div className="sidebar-footer">
          <div className="sidebar-user">{user.email}</div>
          <LogoutButton />
        </div>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}
