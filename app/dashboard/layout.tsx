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

  // Segunda camada de proteção (além do middleware): se por algum motivo
  // chegar aqui sem sessão, manda para o login em vez de renderizar a página.
  if (!user) {
    redirect("/login");
  }

  // Controle de acesso (módulo Financeiro, Fase 1): o papel decide o que
  // aparece no menu. Isso é só usabilidade — a segurança de verdade está
  // nas políticas de RLS (papel_atual()), então mesmo que alguém force a
  // URL de uma tela escondida aqui, o banco continua bloqueando os dados.
  const meuPerfil = await getPerfilForUserId(user.id);
  const veFinanceiro = podeVerFinanceiro(meuPerfil.papel);
  const gereUsuarios = podeGerenciarUsuarios(meuPerfil.papel);

  // Redesenho de 04/08/2026: toda a navegação (ícones, recolher/expandir,
  // tema claro/escuro) mudou pra um client component (SidebarNav) porque
  // precisa de estado no navegador — este layout continua só resolvendo
  // sessão/permissão no servidor e repassando o resultado já pronto.
  return (
    <div className="dashboard-shell">
      <SidebarNav veFinanceiro={veFinanceiro} gereUsuarios={gereUsuarios} userEmail={user.email ?? ""} />
      <main className="main-content">{children}</main>
    </div>
  );
}
