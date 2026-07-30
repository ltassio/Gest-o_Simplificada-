-- Migration 005: Contas Bancárias (módulo Financeiro).
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS). Aplicada manualmente
-- no SQL Editor do Supabase, como as migrations anteriores.
--
-- Contexto de negócio (pedido do usuário em 30/07/2026): cadastro de contas
-- de banco para controle de saldo — separado de Contas a Pagar/Receber
-- (que controlam o que ainda vai sair/entrar) e separado do Caixa (que é o
-- caixa físico do dia a dia, ainda na Fase 2). Aqui é o saldo em conta
-- bancária propriamente dito (conta corrente, poupança, carteira digital).
--
-- Escopo desta primeira versão: cadastro + saldo atualizado manualmente
-- pelo usuário (ex.: após conferir o extrato do banco). Conciliação
-- automática a partir de Contas a Pagar/Receber/Caixa fica para uma fase
-- futura, quando fizer sentido vincular cada lançamento a uma conta
-- bancária específica.
--
-- Mesmo padrão de controle de acesso das demais tabelas do Financeiro:
-- só papel 'dono' ou 'financeiro' leem/escrevem (papel_atual(), criada na
-- migration 004_financeiro_fase1.sql). "operador" não vê nada aqui.

create table if not exists contas_bancarias (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  nome           text not null,
  banco          text,
  agencia        text,
  numero_conta   text,
  tipo           text not null default 'corrente' check (tipo in ('corrente', 'poupanca', 'carteira_digital', 'outra')),
  saldo_inicial  numeric(12,2) not null default 0,
  saldo_atual    numeric(12,2) not null default 0,
  ativa          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_contas_bancarias_tenant on contas_bancarias (tenant_id);

alter table contas_bancarias enable row level security;

drop policy if exists contas_bancarias_select on contas_bancarias;
create policy contas_bancarias_select on contas_bancarias
  for select using (tenant_id = tenant_atual() and papel_atual() in ('dono', 'financeiro'));

drop policy if exists contas_bancarias_insert on contas_bancarias;
create policy contas_bancarias_insert on contas_bancarias
  for insert with check (tenant_id = tenant_atual() and papel_atual() in ('dono', 'financeiro'));

drop policy if exists contas_bancarias_update on contas_bancarias;
create policy contas_bancarias_update on contas_bancarias
  for update
  using (tenant_id = tenant_atual() and papel_atual() in ('dono', 'financeiro'))
  with check (tenant_id = tenant_atual() and papel_atual() in ('dono', 'financeiro'));

drop policy if exists contas_bancarias_delete on contas_bancarias;
create policy contas_bancarias_delete on contas_bancarias
  for delete using (tenant_id = tenant_atual() and papel_atual() in ('dono', 'financeiro'));
