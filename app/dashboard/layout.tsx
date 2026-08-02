import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { podeVerFinanceiro, podeGerenciarUsuarios } from "@/lib/permissoes";
import LogoutButton from "./logout-button";
import SidebarSection from "./sidebar-section";

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
          Dashboard
        </Link>
        <Link href="/dashboard/agenda" className="sidebar-link">
          Agenda
        </Link>
        <Link href="/dashboard/caixa" className="sidebar-link">
          Caixa
        </Link>

        <SidebarSection
          title="Produto e Serviço"
          links={[{ href: "/dashboard/servicos", label: "Cadastro de Produto e Serviço" }]}
        />

        <SidebarSection
          title="Cadastro de Parceiro"
          links={[
            ...(veFinanceiro
              ? [{ href: "/dashboard/fornecedores", label: "Fornecedor" }]
              : []),
            { href: "/dashboard/profissionais", label: "Profissional" },
            { href: "/dashboard/clientes", label: "Cliente" },
          ]}
        />

        {veFinanceiro && (
          <SidebarSection
            title="Financeiro"
            links={[
              { href: "/dashboard/contas-a-pagar", label: "Lançamento · Contas a Pagar" },
              { href: "/dashboard/contas-a-receber", label: "Lançamento · Contas a Receber" },
              { href: "/dashboard/financeiro/fluxo-caixa", label: "Fluxo de Caixa" },
              { href: "/dashboard/financeiro/contas-bancarias", label: "Contas Bancárias" },
              { href: "/dashboard/financeiro/formas-pagamento", label: "Formas de Pagamento" },
              { href: "/dashboard/financeiro/plano-contas", label: "Plano de Contas" },
              { href: "/dashboard/precificacao", label: "Precificação" },
            ]}
          />
        )}

        {/* Aba "Relatórios Gerenciais" (pedido do usuário em 02/08/2026),
            dividida nos dois grupos que ele pediu — Financeiro e Clientes —
            como duas SidebarSection separadas (o componente só aceita uma
            lista plana de links, então dois títulos seguidos reproduzem a
            separação visual sem precisar mexer no componente). Ficam atrás
            do mesmo controle de acesso do Financeiro porque todos os 6
            relatórios expõem receita, lucro ou contas a receber — dado
            sensível, mesma régua já aplicada ao resto do módulo. */}
        {veFinanceiro && (
          <>
            <SidebarSection
              title="Relatórios · Financeiro"
              links={[
                { href: "/dashboard/relatorios/ltv", label: "LTV (Lifetime Value)" },
                { href: "/dashboard/relatorios/comparativo-anual", label: "Comparativo Anual" },
                { href: "/dashboard/relatorios/comparativo-mensal", label: "Comparativo Mensal" },
                { href: "/dashboard/relatorios/evolucao-faturamento", label: "Evolução do Faturamento" },
              ]}
            />
            <SidebarSection
              title="Relatórios · Clientes"
              links={[
                { href: "/dashboard/relatorios/clientes-devedores", label: "Clientes Devedores" },
                { href: "/dashboard/relatorios/evolucao-clientes", label: "Evolução de Clientes" },
              ]}
            />
          </>
        )}

        {gereUsuarios && (
          <SidebarSection
            title="Administração"
            links={[{ href: "/dashboard/usuarios", label: "Usuários" }]}
          />
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
