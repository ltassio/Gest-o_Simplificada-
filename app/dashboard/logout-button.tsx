"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Ganhou a prop `collapsed` em 04/08/2026 (redesenho da sidebar): com a
// sidebar recolhida numa trilha estreita, o texto "Sair" não cabe mais —
// vira só o ícone, com o texto disponível via title (tooltip nativo).
export default function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="btn btn-ghost btn-block"
      title={collapsed ? "Sair" : undefined}
      aria-label="Sair"
    >
      <i className="ti ti-logout" aria-hidden="true" />
      {!collapsed && <span style={{ marginLeft: 8 }}>Sair</span>}
    </button>
  );
}
