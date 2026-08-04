"use client";

import { useEffect, useState } from "react";

// Alterna entre o tema escuro (padrão) e um tema claro equivalente —
// pedido do usuário em 04/08/2026 junto com o resto do redesenho
// ("Mostruário"). A escolha fica salva em localStorage (chave "gs_tema") e
// é aplicada via atributo data-theme na tag <html> (ver [data-theme="light"]
// em globals.css) — o script em app/layout.tsx lê essa mesma chave antes
// do primeiro paint pra não piscar o tema errado ao recarregar a página.
export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [claro, setClaro] = useState(false);

  useEffect(() => {
    setClaro(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function alternar() {
    const novoClaro = !claro;
    document.documentElement.setAttribute("data-theme", novoClaro ? "light" : "dark");
    try {
      localStorage.setItem("gs_tema", novoClaro ? "light" : "dark");
    } catch {
      // localStorage indisponível (modo privado etc.) — a troca de tema
      // ainda funciona nesta sessão, só não persiste entre recarregamentos.
    }
    setClaro(novoClaro);
  }

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={alternar}
      aria-label={claro ? "Usar fundo escuro" : "Usar fundo claro"}
      title={collapsed ? (claro ? "Usar fundo escuro" : "Usar fundo claro") : undefined}
    >
      <i className={`ti ${claro ? "ti-moon" : "ti-sun"}`} aria-hidden="true" />
      {!collapsed && <span>{claro ? "Fundo escuro" : "Fundo claro"}</span>}
    </button>
  );
}
