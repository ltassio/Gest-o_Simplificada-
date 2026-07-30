import { createClient } from "@supabase/supabase-js";

// Cliente Supabase do lado servidor, usado apenas para validar o token de
// login do usuário (auth.getUser). Usa a "secret key" do projeto (a nova
// versão da service_role key), que nunca deve ser exposta ao navegador —
// por isso NÃO tem prefixo NEXT_PUBLIC_.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export const supabaseAdmin = createClient(supabaseUrl ?? "", supabaseSecretKey ?? "", {
  auth: { autoRefreshToken: false, persistSession: false },
});
