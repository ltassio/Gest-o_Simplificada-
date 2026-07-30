"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { FluxoBucket } from "@/lib/fluxoCaixa";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Gráfico de fluxo de caixa: barras mostram o que entra (Contas a Receber)
// e o que sai (Contas a Pagar) em cada faixa de vencimento; a linha mostra
// o saldo acumulado projetado — se ela cruza para negativo, é o sinal
// visual de déficit (o caixa não cobre o que vai vencer).
export default function FluxoCaixaChart({ buckets }: { buckets: FluxoBucket[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={buckets} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={12}
            tickFormatter={(v) => formatarMoeda(Number(v))}
            width={90}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatarMoeda(value), name]}
            contentStyle={{
              background: "var(--bg-elevated-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
            }}
          />
          <Legend />
          <Bar dataKey="total_a_receber" name="A Receber" fill="var(--success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="total_a_pagar" name="A Pagar" fill="var(--danger)" radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="saldo_acumulado"
            name="Saldo acumulado"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
