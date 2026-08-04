"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
