import { prisma } from "./prisma";

export interface FluxoBucket {
  label: string;
  // "vencido" | "dia" | "depois" — usado pelo componente de gráfico para
  // colorir "Vencido" de um jeito visualmente distinto das barras normais
  // de "a pagar" (vermelho mais apagado — é passado, não é o alerta
  // principal do gráfico).
  tipo: "vencido" | "dia" | "depois";
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

// Visão diária do fluxo de caixa (a pedido do usuário em 01/08/2026,
// substituindo as faixas largas anteriores — "8–15 dias" / "16–30 dias" —
// que existiam antes desta mudança). "Vencido" continua agregado num único
// bucket (o passado não muda, não faz sentido fatiar dia a dia); depois um
// dia de cada vez, de hoje até 13 dias à frente (JANELA_DIAS), que é a
// janela em que dá pra agir de verdade (adiar um pagamento, cobrar um
// cliente); "Depois" agrega o que está mais distante num único bloco, pra
// não virar uma régua infinita de barrinhas.
const JANELA_DIAS = 14;

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

function diaLabel(offset: number, hoje: Date): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + offset);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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

  // Índice 0 = "Vencido"; índices 1..JANELA_DIAS = um dia cada (hoje até
  // hoje+13); último índice = "Depois" (agrega o resto).
  const buckets: FluxoBucket[] = [
    { label: "Vencido", tipo: "vencido", total_a_pagar: 0, total_a_receber: 0, saldo: 0, saldo_acumulado: 0 },
    ...Array.from({ length: JANELA_DIAS }, (_, offset) => ({
      label: offset === 0 ? "Hoje" : diaLabel(offset, hoje),
      tipo: "dia" as const,
      total_a_pagar: 0,
      total_a_receber: 0,
      saldo: 0,
      saldo_acumulado: 0,
    })),
    { label: "Depois", tipo: "depois", total_a_pagar: 0, total_a_receber: 0, saldo: 0, saldo_acumulado: 0 },
  ];

  function bucketIndex(dataVencimento: Date): number {
    const dias = diasAteVencimento(dataVencimento, hoje);
    if (dias < 0) return 0;
    if (dias < JANELA_DIAS) return 1 + dias;
    return buckets.length - 1;
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
