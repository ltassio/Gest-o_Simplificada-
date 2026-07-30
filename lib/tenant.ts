import type { SupabaseClient } from "@supabase/supabase-js";

// Descobre o tenant_id do usuário logado a partir da tabela `perfis`.
//
// Necessário porque a migration 001_schema_inicial.sql NÃO tem valor
// padrão automático para tenant_id nas tabelas de negócio (clientes,
// profissionais, servicos, agendamentos, parametros_precificacao) — a
// política de RLS só EXIGE que "tenant_id = tenant_atual()" na escrita
// (with check), não preenche a coluna sozinha. Por isso todo INSERT feito
// direto do navegador (CRUD simples, conforme Arquitetura Técnica v1.0,
// Seção 4) precisa informar o tenant_id explicitamente.
//
// Isso é seguro mesmo vindo do navegador: a política de RLS de `perfis`
// (tenant_id = tenant_atual()) garante que o usuário só consegue ler a
// própria linha, então o tenant_id devolvido aqui é sempre o do usuário
// autenticado — nunca de outro tenant.
export async function getTenantId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Usuário não autenticado.");
  }

  const { data, error } = await supabase
    .from("perfis")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    throw new Error("Não foi possível identificar a empresa (tenant) do usuário.");
  }

  return data.tenant_id as string;
}
