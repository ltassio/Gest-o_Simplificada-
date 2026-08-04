import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro, podeGerenciarUsuarios } from "@/lib/permissoes";
import SidebarNav from "./sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meuPerfil = await getPerfilForUserId(user.id);
  const veFinanceiro = podeVerFinanceiro(meuPerfil.papel);
  const gereUsuarios = podeGerenciarUsuarios(meuPerfil.papel);

  return (
    <div className="dashboard-shell">
      <SidebarNav veFinanceiro={veFinanceiro} gereUsuarios={gereUsuarios} userEmail={user.email ?? ""} />
      <main className="main-content">{children}</main>
    </div>
  );
}
