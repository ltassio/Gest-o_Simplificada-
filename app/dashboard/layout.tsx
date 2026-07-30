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
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <nav
        style={{
          width: 200,
          borderRight: "1px solid #eee",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <strong style={{ marginBottom: 16 }}>Gestão Simples</strong>
        <Link href="/dashboard">Início</Link>
        <Link href="/dashboard/agenda">Agenda</Link>
        <Link href="/dashboard/clientes">Clientes</Link>
        <div style={{ marginTop: "auto" }}>
          <LogoutButton />
        </div>
      </nav>
      <main style={{ flex: 1, padding: 32 }}>{children}</main>
    </div>
  );
}
