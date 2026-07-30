"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
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
      style={{
        background: "none",
        border: "1px solid #ccc",
        borderRadius: 4,
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      Sair
    </button>
  );
}
