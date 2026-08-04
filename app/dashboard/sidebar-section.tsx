"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface SidebarSectionLink {
  href: string;
  label: string;
}

// Seção comprimível da sidebar (pedido do usuário em 30/07/2026): a aba
// "Financeiro" tem muitos links e ficava grande demais sempre aberta.
// Começa fechada por padrão, mas abre sozinha se a página atual já está
// dentro dela (ex.: usuário deu refresh numa tela do Financeiro) — assim
// não "esconde" onde a pessoa está.
//
// Redesenho de 04/08/2026: ganhou um ícone (prop `icon`, nome do Tabler
// Icons sem o prefixo "ti-") e um modo `collapsed`. Com a sidebar inteira
// recolhida (ver SidebarNav) não faz sentido abrir um acordeão com texto —
// o clique no ícone só pede pra sidebar reabrir (`onExpandRequest`).
export default function SidebarSection({
  title,
  icon,
  links,
  collapsed = false,
  onExpandRequest,
}: {
  title: string;
  icon?: string;
  links: SidebarSectionLink[];
  collapsed?: boolean;
  onExpandRequest?: () => void;
}) {
  const pathname = usePathname();
  const estaDentro = links.some((l) => pathname.startsWith(l.href));
  const [aberto, setAberto] = useState(estaDentro);

  if (collapsed) {
    return (
      <button
        type="button"
        className={`sidebar-link sidebar-link-collapsed ${estaDentro ? "sidebar-link-active" : ""}`}
        onClick={onExpandRequest}
        aria-label={title}
        title={title}
      >
        {icon && <i className={`ti ti-${icon}`} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className="sidebar-collapsible">
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="sidebar-section-toggle-label">
          {icon && <i className={`ti ti-${icon}`} aria-hidden="true" />}
          <span>{title}</span>
        </span>
        <span className={`sidebar-chevron ${aberto ? "sidebar-chevron-open" : ""}`}>
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </span>
      </button>

      {aberto && (
        <div className="sidebar-collapsible-content">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="sidebar-link">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
