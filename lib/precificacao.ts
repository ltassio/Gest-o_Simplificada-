// Implementação da fórmula definida no Documento de Visão do Produto v2.0,
// Seção 5.3 (Sub-módulo de Precificação), baseada na metodologia do Markup
// Divisor (SEBRAE), adaptada com o conceito de "custo-hora de cadeira".
//
//   Preço sugerido = (Custo do material + Custo-hora de cadeira × duração)
//                     ÷ (1 − %comissão − %imposto − %margem desejada)
//
//   Custo-hora de cadeira = Custo fixo mensal ÷ Horas produtivas do mês

export class PrecificacaoError extends Error {
  status: number;
  codigo: string;
  constructor(status: number, codigo: string, message: string) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

export interface CalcularPrecoInput {
  custoMaterial: number;
  duracaoMinutos: number;
  custoFixoMensal: number;
  horasProdutivasMes: number;
  percentualComissao: number; // 0-100
  percentualImposto: number; // 0-100
  percentualMargemDesejada: number; // 0-100
}

export interface CalcularPrecoResultado {
  precoSugerido: number;
  detalhamento: {
    custoMaterial: number;
    custoHoraCadeira: number;
    custoMaoDeObra: number;
    percentualComissao: number;
    percentualImposto: number;
    percentualMargemDesejada: number;
    divisor: number;
  };
}

export function calcularPrecoSugerido(input: CalcularPrecoInput): CalcularPrecoResultado {
  const {
    custoMaterial,
    duracaoMinutos,
    custoFixoMensal,
    horasProdutivasMes,
    percentualComissao,
    percentualImposto,
    percentualMargemDesejada,
  } = input;

  if (horasProdutivasMes <= 0) {
    throw new PrecificacaoError(
      422,
      "HORAS_PRODUTIVAS_ZERO",
      "Horas produtivas do mês precisam ser maiores que zero para calcular o custo-hora de cadeira."
    );
  }

  const somaPercentuais =
    percentualComissao / 100 + percentualImposto / 100 + percentualMargemDesejada / 100;
  const divisor = 1 - somaPercentuais;

  if (divisor <= 0) {
    throw new PrecificacaoError(
      422,
      "MARGEM_INVALIDA",
      "A soma de comissão + imposto + margem desejada não pode ser igual ou maior que 100%."
    );
  }

  const custoHoraCadeira = custoFixoMensal / horasProdutivasMes;
  const custoMaoDeObra = custoHoraCadeira * (duracaoMinutos / 60);
  const precoSugerido = (custoMaterial + custoMaoDeObra) / divisor;

  return {
    precoSugerido: round2(precoSugerido),
    detalhamento: {
      custoMaterial: round2(custoMaterial),
      custoHoraCadeira: round2(custoHoraCadeira),
      custoMaoDeObra: round2(custoMaoDeObra),
      percentualComissao,
      percentualImposto,
      percentualMargemDesejada,
      divisor: round4(divisor),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
