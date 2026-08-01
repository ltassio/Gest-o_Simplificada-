-- =============================================================================
-- 008_capacidade_profissional_no_show.sql
-- Adicionado em 01/08/2026 a pedido do usuário, para viabilizar os
-- indicadores do Dashboard "Agenda Ocupada" e "No Show" (tabela de
-- indicadores solicitada em 01/08/2026).
--
-- 1) profissionais.carga_horaria_semanal — capacidade de trabalho do
--    profissional em horas por semana. É a base do indicador "Agenda
--    Ocupada" (ocupado / capacidade). Decisão explícita do usuário: cadastrar
--    capacidade por profissional em vez de reaproveitar o campo
--    "Horas produtivas/mês" da Precificação, que é único por tenant (não por
--    profissional) e pensado para o cálculo de preço de serviço, não para
--    medir ociosidade real da agenda.
--
-- 2) agendamentos.status — ampliado para aceitar 'nao_compareceu'. Hoje o
--    status só é setado como 'concluido' automaticamente (quando o
--    atendimento é lançado no Caixa vinculado ao agendamento); não existe
--    'cancelado' nem 'nao_compareceu' em lugar nenhum da UI ainda — ambos
--    ganham botão na tela de Agenda nesta mesma leva de mudanças.
-- =============================================================================

alter table public.profissionais
  add column if not exists carga_horaria_semanal numeric(5,2) not null default 40;

alter table public.agendamentos
  drop constraint if exists agendamentos_status_check;

alter table public.agendamentos
  add constraint agendamentos_status_check
  check (status in ('agendado', 'concluido', 'cancelado', 'nao_compareceu'));
