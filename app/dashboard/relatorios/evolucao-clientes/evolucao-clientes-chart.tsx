"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { ClientesEvolucaoPonto } from "@/lib/relatorios";

// REGRA DE TEMA (ver app/dashboard/indicador-charts.tsx): contentStyle +
// labelStyle + itemStyle sempre juntos, todos lendo das variáveis do tema.
const tooltipStyle = {
  background: "var(--bg-elevated-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
};
const tooltipLabelStyle = { color: "var(--text)", fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: "var(--text)" };

// Barras = novos clientes cadastrados no mês; linha = total acumulado de
// clientes desde o início (Relatórios Gerenciais · Clientes · Evolução de
// Clientes, 02/08/2026). isAnimationActive={false} nas barras pelo mesmo
// motivo já documentado em fluxo-caixa-chart.tsx: com a animação padrão
// ligada, um ComposedChart misturando Bar (escala pequena) com Line (escala
// bem maior, o acumulado) no mesmo eixo faz a barra renderizar quase
// invisível.
export default function EvolucaoClientesChart({ pontos }: { pontos: ClientesEvolucaoPonto[] }) {
  if (pontos.length === 0) {
    return <p className="empty-state">Ainda não há clientes cadastrados para montar a evolução.</p>;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
          <YAxis stroke="var(--text-muted)" fontSize={12} width={50} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Legend />
          <Bar
            dataKey="novos"
            name="Novos clientes"
            fill="var(--accent)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="total_acumulado"
            name="Total acumulado"
            stroke="var(--success)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
