-- Migration 007: Caixa como PDV — sessão de caixa (abrir/fechar, sangria,
-- suprimento, despesa) e vendas com carrinho multi-item.
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS), aplicada manualmente
-- no SQL Editor do Supabase, como as anteriores.
--
-- Contexto de negócio (pedido do usuário em 31/07/2026, inspirado num
-- print de outro sistema de PDV): o Caixa deixa de ser "lançar 1
-- atendimento avulso direto" e passa a ser um fluxo de venda de verdade:
--   1. Abrir o caixa do dia (sessão) — só pode haver 1 sessão aberta por
--      tenant por vez (garantido por índice único parcial abaixo).
--   2. Montar uma venda: cliente + carrinho de itens (produto OU serviço,
--      cada item com seu profissional e quantidade) + desconto + forma de
--      pagamento.
--   3. Confirmar o pagamento fecha a venda (não confunda com "fechar o
--      caixa" — isso é o dia inteiro, a venda é 1 transação).
--   4. No fim do dia, fechar o caixa: informar o valor contado, o sistema
--      calcula o valor esperado (abertura + vendas em dinheiro + suprimento
--      - sangria - despesa) para conferência.
--
-- Decisão importante (pedido explícito do usuário): o valor de cada item
-- vendido (atendimentos.valor_cobrado) continua sendo sempre o valor BRUTO
-- (o que o item vale, já líquido de desconto, mas ANTES de tirar a
-- comissão do profissional) — nunca o valor líquido pós-comissão. A visão
-- de "quanto sobra pro estúdio depois da comissão" (valor_estudio) já
-- existe à parte e continua sendo tratada só nas telas de relatório/
-- dashboard, nunca how o "Total" mostrado no Caixa/PDV.
--
-- Decisão de RLS: sessão de caixa, movimentos e vendas seguem o mesmo
-- padrão de atendimentos/agendamentos (tenant_isolation simples, qualquer
-- papel do tenant pode operar) — o Caixa sempre foi acessível para
-- "operador" (migration 004, comentário da seção 1), então o PDV não pode
-- ficar restrito a dono/financeiro.

-- ---------------------------------------------------------------------
-- 1. Sessão de Caixa (abertura/fechamento do dia)
-- ---------------------------------------------------------------------

create table if not exists caixa_sessoes (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants(id) on delete cascade,
  numero                      integer not null,
  status                      text not null default 'aberto' check (status in ('aberto', 'fechado')),
  valor_abertura              numeric(10,2) not null default 0,
  valor_fechamento_informado  numeric(10,2),
  valor_fechamento_calculado  numeric(10,2),
  aberto_por_id               uuid,
  fechado_por_id              uuid,
  observacao                  text,
  data_abertura               timestamptz not null default now(),
  data_fechamento             timestamptz,
  created_at                  timestamptz not null default now()
);

create index if not exists idx_caixa_sessoes_tenant on caixa_sessoes (tenant_id);

-- Garante no máximo 1 sessão aberta por tenant ao mesmo tempo.
create unique index if not exists uq_caixa_sessoes_aberta
  on caixa_sessoes (tenant_id)
  where status = 'aberto';

alter table caixa_sessoes enable row level security;

drop policy if exists tenant_isolation on caixa_sessoes;
create policy tenant_isolation on caixa_sessoes
  for all
  using (tenant_id = tenant_atual())
  with check (tenant_id = tenant_atual());

-- ---------------------------------------------------------------------
-- 2. Movimentos de Caixa (sangria, suprimento, despesa)
-- ---------------------------------------------------------------------

create table if not exists caixa_movimentos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  sessao_id           uuid not null references caixa_sessoes(id) on delete cascade,
  tipo                text not null check (tipo in ('suprimento', 'sangria', 'despesa')),
  valor               numeric(10,2) not null check (valor > 0),
  descricao           text,
  forma_pagamento_id  uuid references formas_pagamento(id) on delete set null,
  criado_por_id       uuid,
  data_movimento      timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists idx_caixa_movimentos_tenant on caixa_movimentos (tenant_id);
create index if not exists idx_caixa_movimentos_sessao on caixa_movimentos (sessao_id);

alter table caixa_movimentos enable row level security;

drop policy if exists tenant_isolation on caixa_movimentos;
create policy tenant_isolation on caixa_movimentos
  for all
  using (tenant_id = tenant_atual())
  with check (tenant_id = tenant_atual());

-- ---------------------------------------------------------------------
-- 3. Vendas (cabeçalho da venda — carrinho multi-item)
-- ---------------------------------------------------------------------

create table if not exists vendas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  sessao_id           uuid not null references caixa_sessoes(id),
  numero              integer not null,
  cliente_id          uuid not null references clientes(id),
  forma_pagamento_id  uuid not null references formas_pagamento(id),
  subtotal            numeric(10,2) not null default 0,
  desconto            numeric(10,2) not null default 0,
  total               numeric(10,2) not null default 0,
  status              text not null default 'paga' check (status in ('paga', 'cancelada')),
  data_venda          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists idx_vendas_tenant on vendas (tenant_id);
create index if not exists idx_vendas_sessao on vendas (sessao_id);
create index if not exists idx_vendas_cliente on vendas (cliente_id);

alter table vendas enable row level security;

drop policy if exists tenant_isolation on vendas;
create policy tenant_isolation on vendas
  for all
  using (tenant_id = tenant_atual())
  with check (tenant_id = tenant_atual());

-- ---------------------------------------------------------------------
-- 4. Atendimentos passam a poder pertencer a uma venda (item do carrinho)
-- ---------------------------------------------------------------------

alter table atendimentos add column if not exists venda_id uuid references vendas(id) on delete set null;
alter table atendimentos add column if not exists quantidade integer not null default 1;
alter table atendimentos add column if not exists valor_unitario numeric(10,2);

-- Preenche valor_unitario dos atendimentos já existentes (1 unidade cada).
update atendimentos set valor_unitario = valor_cobrado where valor_unitario is null;

alter table atendimentos alter column valor_unitario set not null;

create index if not exists idx_atendimentos_venda on atendimentos (venda_id);

-- ---------------------------------------------------------------------
-- 5. Formas de Pagamento: marca quais contam no caixa físico (dinheiro) e
--    libera a leitura para qualquer papel do tenant (antes só dono/
--    financeiro liam — mas agora o PDV, usado por "operador" também,
--    precisa listar as formas de pagamento ativas para o seletor de
--    venda). Continua só dono/financeiro podendo criar/editar/excluir.
-- ---------------------------------------------------------------------

alter table formas_pagamento add column if not exists conta_no_caixa_fisico boolean not null default true;

update formas_pagamento set conta_no_caixa_fisico = false
where lower(nome) not like '%dinheiro%';

drop policy if exists formas_pagamento_select on formas_pagamento;
create policy formas_pagamento_select on formas_pagamento
  for select using (tenant_id = tenant_atual());

-- ---------------------------------------------------------------------
-- 6. Numeração sequencial: função auxiliar para "próximo número" por
--    tenant, usada tanto em sessões de caixa quanto em vendas — evita
--    duplicar essa lógica nas API routes e cobre concorrência básica com
--    um advisory lock por tenant.
-- ---------------------------------------------------------------------

create or replace function proximo_numero_caixa_sessao(p_tenant_id uuid)
returns integer
language plpgsql
as $$
declare
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtext('caixa_sessoes' || p_tenant_id::text));
  select coalesce(max(numero), 0) + 1 into v_numero from caixa_sessoes where tenant_id = p_tenant_id;
  return v_numero;
end;
$$;

create or replace function proximo_numero_venda(p_tenant_id uuid)
returns integer
language plpgsql
as $$
declare
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtext('vendas' || p_tenant_id::text));
  select coalesce(max(numero), 0) + 1 into v_numero from vendas where tenant_id = p_tenant_id;
  return v_numero;
end;
$$;
