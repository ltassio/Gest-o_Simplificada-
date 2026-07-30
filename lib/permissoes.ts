// Controle de acesso por papel (Documento de Modelagem de Banco de Dados
// v1.2, módulo Financeiro Fase 1).
//
// Este arquivo controla só o que aparece na interface (esconder links de
// menu, desabilitar ações). A segurança de verdade — o que cada usuário
// consegue ler/escrever mesmo chamando a API do Supabase diretamente —
// está garantida pelas políticas de RLS no banco (função papel_atual(),
// ver migration 004_financeiro_fase1.sql). As duas camadas precisam ficar
// alinhadas, mas se uma regra daqui divergir do banco, o banco vence.
export type Papel = "dono" | "financeiro" | "operador";

export const PAPEL_LABEL: Record<Papel, string> = {
  dono: "Dono(a)",
  financeiro: "Financeiro",
  operador: "Operador(a)",
};

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  dono: "Acesso total ao sistema, incluindo gerenciar usuários.",
  financeiro: "Acesso total ao módulo Financeiro (Contas a Pagar/Receber, Fluxo de Caixa, Plano de Contas, DRE, Orçamento). Não gerencia usuários.",
  operador: "Acesso à Agenda, Clientes, Serviços e Caixa do dia. Não enxerga o módulo Financeiro.",
};

// Papéis que enxergam o módulo Financeiro inteiro.
export function podeVerFinanceiro(papel: string | null | undefined): boolean {
  return papel === "dono" || papel === "financeiro";
}

// Só o "dono" convida/gerencia usuários.
export function podeGerenciarUsuarios(papel: string | null | undefined): boolean {
  return papel === "dono";
}

export function ehPapelValido(valor: string): valor is Papel {
  return valor === "dono" || valor === "financeiro" || valor === "operador";
}
