import { createClient } from "@/lib/supabase/server";

export default async function DashboardHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1>Bem-vindo(a)</h1>
      <p>Logado como {user?.email}.</p>
      <p>Use o menu ao lado para acessar a Agenda ou os Clientes.</p>
    </div>
  );
}
