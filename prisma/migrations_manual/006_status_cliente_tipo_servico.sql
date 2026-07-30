-- =============================================================================
-- 006_status_cliente_tipo_servico.sql
-- Adicionado em 30/07/2026 a pedido do usuário, junto com a reorganização da
-- navegação em "Cadastro de Parceiro" (Fornecedor, Profissional, Cliente) e a
-- unificação de Produtos e Serviços numa única tela de cadastro.
--
-- 1) clientes.ativo — status Ativo/Inativo do cliente, exibido no cadastro
--    (mesmo padrão já usado em profissionais.ativo). Não afeta o histórico de
--    atendimentos já lançado: um cliente inativo continua aparecendo nos
--    atendimentos passados normalmente.
--
-- 2) servicos.tipo — distingue "servico" de "produto" dentro da mesma tabela
--    (em vez de criar uma tabela nova), porque as duas coisas compartilham a
--    mesma estrutura de cadastro (nome, preço, categoria) e porque Serviço já
--    é referenciado por agendamentos/atendimentos — criar uma tabela separada
--    exigiria duplicar essas relações sem ganho real nesta fase. Produtos
--    simplesmente não participam de agendamento/atendimento na prática (a UI
--    não impede, mas o uso pretendido é só cadastro/preço).
-- =============================================================================

alter table public.clientes
  add column if not exists ativo boolean not null default true;

alter table public.servicos
  add column if not exists tipo text not null default 'servico';

alter table public.servicos
  add constraint servicos_tipo_check check (tipo in ('servico', 'produto'));
