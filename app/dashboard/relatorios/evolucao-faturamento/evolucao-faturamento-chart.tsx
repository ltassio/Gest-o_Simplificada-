"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { FaturamentoPonto } from "@/lib/relatorios";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// REGRA DE TEMA (ver app/dashboard/indicador-charts.tsx): contentStyle +
// labelStyle + itemStyle sempre juntos em qualquer <Tooltip> do recharts,
// todos lendo das variáveis do tema — nunca uma cor fixa.
const tooltipStyle = {
  background: "var(--bg-elevated-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
};
const tooltipLabelStyle = { color: "var(--text)", fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: "var(--text)" };

// Linha simples de receita mês a mês (Relatórios Gerenciais · Financeiro ·
// Evolução do Faturamento, 02/08/2026) — deliberadamente só uma métrica
// (receita), sem despesa/lucro junto: essa comparação já existe na tabela
// de Comparativo Mensal; aqui o objetivo é a leitura rápida de tendência.
export default function EvolucaoFaturamentoChart({ pontos }: { pontos: FaturamentoPonto[] }) {
  if (pontos.length === 0) {
    return <p className="empty-state">Ainda não há atendimentos lançados para montar a evolução.</p>;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={pontos} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={12}
            tickFormatter={(v) => formatarMoeda(Number(v))}
            width={90}
          />
          <Tooltip
            formatter={(value: number) => [formatarMoeda(value), "Receita"]}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Line
            type="monotone"
            dataKey="receita"
            name="Receita"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
