"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import SidebarSection from "./sidebar-section";
import ThemeToggle from "./theme-toggle";
import LogoutButton from "./logout-button";

interface NavLink {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  title: string;
  icon: string;
  links: { href: string; label: string }[];
}

const LINKS_PRINCIPAIS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/dashboard/agenda", label: "Agenda", icon: "calendar" },
  { href: "/dashboard/caixa", label: "Caixa", icon: "cash-register" },
];

const CHAVE_COLAPSO = "gs_sidebar_colapsada";

export default function SidebarNav({
  veFinanceiro,
  gereUsuarios,
  userEmail,
}: {
  veFinanceiro: boolean;
  gereUsuarios: boolean;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [colapsada, setColapsada] = useState(false);

  useEffect(() => {
    try {
      setColapsada(localStorage.getItem(CHAVE_COLAPSO) === "1");
    } catch {}
  }, []);

  function alternarColapso() {
    setColapsada((v) => {
      const novo = !v;
      try {
        localStorage.setItem(CHAVE_COLAPSO, novo ? "1" : "0");
      } catch {}
      return novo;
    });
  }

  function expandir() {
    setColapsada(false);
    try {
      localStorage.setItem(CHAVE_COLAPSO, "0");
    } catch {}
  }

  const grupos: NavGroup[] = [
    {
      title: "Produto e Serviço",
      icon: "package",
      links: [{ href: "/dashboard/servicos", label: "Cadastro de Produto e Serviço" }],
    },
    {
      title: "Cadastro de Parceiro",
      icon: "users",
      links: [
        ...(veFinanceiro ? [{ href: "/dashboard/fornecedores", label: "Fornecedor" }] : []),
        { href: "/dashboard/profissionais", label: "Profissional" },
        { href: "/dashboard/clientes", label: "Cliente" },
      ],
    },
    ...(veFinanceiro
      ? [
          {
            title: "Financeiro",
            icon: "wallet",
            links: [
              { href: "/dashboard/contas-a-pagar", label: "Lançamento · Contas a Pagar" },
              { href: "/dashboard/contas-a-receber", label: "Lançamento · Contas a Receber" },
              { href: "/dashboard/financeiro/fluxo-caixa", label: "Fluxo de Caixa" },
              { href: "/dashboard/financeiro/contas-bancarias", label: "Contas Bancárias" },
              { href: "/dashboard/financeiro/formas-pagamento", label: "Formas de Pagamento" },
              { href: "/dashboard/financeiro/plano-contas", label: "Plano de Contas" },
              { href: "/dashboard/precificacao", label: "Precificação" },
            ],
          },
        ]
      : []),
    ...(veFinanceiro
      ? [
          {
            title: "Relatório Gerencial",
            icon: "report-analytics",
            links: [
              { href: "/dashboard/relatorios/ltv", label: "LTV (Lifetime Value)" },
              { href: "/dashboard/relatorios/comparativo-anual", label: "Comparativo Anual" },
              { href: "/dashboard/relatorios/comparativo-mensal", label: "Comparativo Mensal" },
              { href: "/dashboard/relatorios/evolucao-faturamento", label: "Evolução do Faturamento" },
              { href: "/dashboard/relatorios/clientes-devedores", label: "Clientes Devedores" },
              { href: "/dashboard/relatorios/evolucao-clientes", label: "Evolução de Clientes" },
            ],
          },
        ]
      : []),
    ...(gereUsuarios
      ? [{ title: "Administração", icon: "settings", links: [{ href: "/dashboard/usuarios", label: "Usuários" }] }]
      : []),
  ];

  return (
    <nav className={`sidebar ${colapsada ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-brand">
        <span className="dot" />
        {!colapsada && <span>Gestão Simples</span>}
      </div>

      <button
        type="button"
        className="sidebar-toggle-btn"
        onClick={alternarColapso}
        aria-label={colapsada ? "Expandir menu" : "Recolher menu"}
      >
        <i className={`ti ${colapsada ? "ti-chevron-right" : "ti-chevron-left"}`} aria-hidden="true" />
        {!colapsada && <span>Recolher menu</span>}
      </button>

      {LINKS_PRINCIPAIS.map((l) => {
        const ativo = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`sidebar-link ${colapsada ? "sidebar-link-collapsed" : ""} ${ativo ? "sidebar-link-active" : ""}`}
            title={colapsada ? l.label : undefined}
          >
            <i className={`ti ti-${l.icon}`} aria-hidden="true" />
            {!colapsada && <span>{l.label}</span>}
          </Link>
        );
      })}

      <div
        style={{
          height: 1,
          background: "var(--border)",
          margin: colapsada ? "10px 4px" : "12px 4px",
          width: colapsada ? 36 : "auto",
        }}
      />

      {grupos.map((g) => (
        <SidebarSection
          key={g.title}
          title={g.title}
          icon={g.icon}
          links={g.links}
          collapsed={colapsada}
          onExpandRequest={expandir}
        />
      ))}

      <div className="sidebar-footer">
        {!colapsada && <div className="sidebar-user">{userEmail}</div>}
        <ThemeToggle collapsed={colapsada} />
        <LogoutButton collapsed={colapsada} />
      </div>
    </nav>
  );
}
