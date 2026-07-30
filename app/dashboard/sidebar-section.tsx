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
export default function SidebarSection({
  title,
  links,
}: {
  title: string;
  links: SidebarSectionLink[];
}) {
  const pathname = usePathname();
  const estaDentro = links.some((l) => pathname.startsWith(l.href));
  const [aberto, setAberto] = useState(estaDentro);

  return (
    <div className="sidebar-collapsible">
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span>{title}</span>
        <span className={`sidebar-chevron ${aberto ? "sidebar-chevron-open" : ""}`}>▸</span>
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
