import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Raiz do site: manda direto para o dashboard (se já logado) ou para o
// login. Não há mais uma home pública — o produto é 100% autenticado.
export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
