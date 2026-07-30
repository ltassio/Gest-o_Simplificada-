import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para uso no navegador (Client Components).
// Usa a URL do projeto e a "publishable key" (antiga "anon key") — ambas
// seguras para expor no navegador, por isso levam o prefixo NEXT_PUBLIC_.
// Toda a proteção real de dados vem da Row-Level Security (RLS), não do
// sigilo dessas duas variáveis.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
