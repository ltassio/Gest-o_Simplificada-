// Estrutura da DRE (Demonstração do Resultado do Exercício), adaptada
// para negócio de serviços (sem CMV de produto — usa Custo dos Serviços
// Prestados no lugar). Compartilhado entre o Plano de Contas (Fase 1,
// onde cada conta já nasce marcada com sua natureza_dre) e a DRE
// propriamente dita (Fase 3, onde estes valores são somados por período).
export type NaturezaDre =
  | "receita_servicos"
  | "deducoes"
  | "custo_servicos"
  | "despesa_operacional"
  | "despesa_financeira"
  | "receita_financeira"
  | "outras_receitas"
  | "outras_despesas";

export const NATUREZA_DRE_LABEL: Record<NaturezaDre, string> = {
  receita_servicos: "Receita Bruta de Serviços",
  deducoes: "Deduções (impostos sobre serviço)",
  custo_servicos: "Custo dos Serviços Prestados",
  despesa_operacional: "Despesas Operacionais",
  despesa_financeira: "Despesas Financeiras",
  receita_financeira: "Receitas Financeiras",
  outras_receitas: "Outras Receitas",
  outras_despesas: "Outras Despesas",
};

// Ordem em que as linhas aparecem na DRE (Fase 3).
export const ORDEM_NATUREZA_DRE: NaturezaDre[] = [
  "receita_servicos",
  "deducoes",
  "custo_servicos",
  "despesa_operacional",
  "despesa_financeira",
  "receita_financeira",
  "outras_receitas",
  "outras_despesas",
];
