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
          {/* REGRA DE TEMA: contentStyle só estiliza o fundo do balão do
              Tooltip do recharts — o texto do título e das linhas de valor
              usa labelStyle/itemStyle à parte, que o recharts preenche com
              preto por padrão se não forem passados (bug real encontrado em
              produção em 31/07/2026: texto ilegível sobre o fundo escuro).
              Sempre que mexer aqui ou mudar o tema, mantenha os três juntos
              usando as variáveis de cor do tema (nunca uma cor fixa), assim
              o contraste continua correto sozinho. */}
          <Tooltip
            formatter={(value: number, name: string) => [formatarMoeda(value), name]}
            contentStyle={{
              background: "var(--bg-elevated-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
            }}
            labelStyle={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: "var(--text)" }}
          />
          <Legend />
          {/* isAnimationActive={false}: bug real encontrado em produção em
              31/07/2026 — com a animação padrão do recharts ligada, as
              barras deste gráfico (que mistura valores positivos e
              negativos com a Line de saldo_acumulado no mesmo eixo Y)
              ficavam praticamente invisíveis, presas perto da altura 0 da
              animação em vez de crescerem até a altura final. Desligar a
              animação faz a barra renderizar direto no tamanho correto. */}
          <Bar
            dataKey="total_a_receber"
            name="A Receber"
            fill="var(--success)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="total_a_pagar"
            name="A Pagar"
            fill="var(--danger)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="saldo_acumulado"
            name="Saldo acumulado"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
