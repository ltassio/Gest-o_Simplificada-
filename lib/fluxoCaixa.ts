import { prisma } from "./prisma";

export interface FluxoBucket {
  label: string;
  total_a_pagar: number;
  total_a_receber: number;
  saldo: number;
  saldo_acumulado: number;
}

export interface FluxoCaixa {
  buckets: FluxoBucket[];
  total_a_pagar_aberto: number;
  total_a_receber_aberto: number;
  saldo_final: number;
  situacao: "liquidez" | "deficit";
}

// Faixas de vencimento usadas para agrupar o fluxo (Documento de Visão do
// Produto, próxima versão — módulo de Contas a Pagar/Receber). "Vencido"
// fica isolado na primeira faixa porque é dinheiro que já deveria ter
// entrado/saído — não faz sentido misturar com o que ainda vai vencer.
const FAIXAS = [
  { label: "Vencido", min: -Infinity, max: -1 },
  { label: "Próx. 7 dias", min: 0, max: 7 },
  { label: "8–15 dias", min: 8, max: 15 },
  { label: "16–30 dias", min: 16, max: 30 },
  { label: "Depois de 30 dias", min: 31, max: Infinity },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function diasAteVencimento(dataVencimento: Date, hoje: Date): number {
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const vencUTC = Date.UTC(
    dataVencimento.getUTCFullYear(),
    dataVencimento.getUTCMonth(),
    dataVencimento.getUTCDate()
  );
  return Math.round((vencUTC - hojeUTC) / 86400000);
}

// Projeta, a partir das contas ainda em aberto, se o caixa tem liquidez ou
// fica em déficit nos próximos ~30 dias. Não olha o saldo bancário real
// (o sistema não tem essa informação) — projeta só a partir do que está
// lançado como a pagar/a receber, o que já é a pergunta que o dono do
// negócio faz na prática ("o que vence essa semana e eu tenho pra cobrir?").
export async function getFluxoDeCaixa(tenantId: string): Promise<FluxoCaixa> {
  const hoje = new Date();

  const [contasPagar, contasReceber] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { tenantId, status: "a_pagar" },
      select: { valor: true, dataVencimento: true },
    }),
    prisma.contaReceber.findMany({
      where: { tenantId, status: "a_receber" },
      select: { valor: true, dataVencimento: true },
    }),
  ]);

  const buckets: FluxoBucket[] = FAIXAS.map((f) => ({
    label: f.label,
    total_a_pagar: 0,
    total_a_receber: 0,
    saldo: 0,
    saldo_acumulado: 0,
  }));

  function bucketIndex(dataVencimento: Date): number {
    const dias = diasAteVencimento(dataVencimento, hoje);
    const idx = FAIXAS.findIndex((f) => dias >= f.min && dias <= f.max);
    return idx === -1 ? FAIXAS.length - 1 : idx;
  }

  let totalAPagarAberto = 0;
  for (const c of contasPagar) {
    const valor = Number(c.valor);
    totalAPagarAberto += valor;
    buckets[bucketIndex(c.dataVencimento)].total_a_pagar += valor;
  }

  let totalAReceberAberto = 0;
  for (const c of contasReceber) {
    const valor = Number(c.valor);
    totalAReceberAberto += valor;
    buckets[bucketIndex(c.dataVencimento)].total_a_receber += valor;
  }

  let acumulado = 0;
  for (const b of buckets) {
    b.total_a_pagar = round2(b.total_a_pagar);
    b.total_a_receber = round2(b.total_a_receber);
    b.saldo = round2(b.total_a_receber - b.total_a_pagar);
    acumulado = round2(acumulado + b.saldo);
    b.saldo_acumulado = acumulado;
  }

  return {
    buckets,
    total_a_pagar_aberto: round2(totalAPagarAberto),
    total_a_receber_aberto: round2(totalAReceberAberto),
    saldo_final: acumulado,
    situacao: acumulado >= 0 ? "liquidez" : "deficit",
  };
}
