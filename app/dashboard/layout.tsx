import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro, podeGerenciarUsuarios } from "@/lib/permissoes";
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

  // Controle de acesso (módulo Financeiro, Fase 1): o papel decide o que
  // aparece no menu. Isso é só usabilidade — a segurança de verdade está
  // nas políticas de RLS (papel_atual()), então mesmo que alguém force a
  // URL de uma tela escondida aqui, o banco continua bloqueando os dados.
  const meuPerfil = await getPerfilForUserId(user.id);
  const veFinanceiro = podeVerFinanceiro(meuPerfil.papel);
  const gereUsuarios = podeGerenciarUsuarios(meuPerfil.papel);

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

        {veFinanceiro && (
          <>
            <div className="sidebar-section-label">Financeiro</div>
            <Link href="/dashboard/contas-a-pagar" className="sidebar-link">
              Lançamento · Contas a Pagar
            </Link>
            <Link href="/dashboard/contas-a-receber" className="sidebar-link">
              Lançamento · Contas a Receber
            </Link>
            <Link href="/dashboard/financeiro/fluxo-caixa" className="sidebar-link">
              Fluxo de Caixa
            </Link>
            <Link href="/dashboard/fornecedores" className="sidebar-link">
              Fornecedores
            </Link>
            <Link href="/dashboard/financeiro/formas-pagamento" className="sidebar-link">
              Formas de Pagamento
            </Link>
            <Link href="/dashboard/financeiro/plano-contas" className="sidebar-link">
              Plano de Contas
            </Link>
          </>
        )}

        {gereUsuarios && (
          <>
            <div className="sidebar-section-label">Administração</div>
            <Link href="/dashboard/usuarios" className="sidebar-link">
              Usuários
            </Link>
          </>
        )}

        <div className="sidebar-footer">
          <div className="sidebar-user">{user.email}</div>
          <LogoutButton />
        </div>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}
