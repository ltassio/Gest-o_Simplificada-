"use client";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AgendaResumo, ClientesResumo, ServicoMaisVendido } from "@/lib/dashboard";
import type { ResumoPorProfissional } from "@/lib/caixa";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const tooltipStyle = {
  background: "var(--bg-elevated-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
};

// Bloco Agenda em gráfico de pizza (Anexo A da EF: "Ocupação, Cancelamentos").
// A taxa de cancelamento fica como legenda textual abaixo — é uma razão
// calculada sobre o total, não uma fatia independente do gráfico.
export function AgendaChart({ resumo }: { resumo: AgendaResumo }) {
  const data = [
    { name: "Agendados", value: resumo.agendados, color: "var(--accent)" },
    { name: "Concluídos", value: resumo.concluidos, color: "var(--success)" },
    { name: "Cancelados", value: resumo.cancelados, color: "var(--danger)" },
  ];

  if (resumo.total === 0) {
    return <p className="empty-state">Nenhum agendamento no período selecionado.</p>;
  }

  return (
    <div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, margin: "8px 0 0 0" }}>
        Taxa de cancelamento: <strong style={{ color: "var(--text)" }}>{resumo.taxa_cancelamento}%</strong>
      </p>
    </div>
  );
}

// Bloco Clientes em gráfico de barras (Ativos / Novos no período / Inativos).
export function ClientesChart({ resumo }: { resumo: ClientesResumo }) {
  const data = [
    { name: "Ativos", valor: resumo.ativos, color: "var(--success)" },
    { name: "Novos no período", valor: resumo.novos_periodo, color: "var(--accent)" },
    { name: "Inativos", valor: resumo.inativos, color: "var(--text-muted)" },
  ];

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
          <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} width={36} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="valor" name="Clientes" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bloco Profissionais em gráfico de barras agrupadas: Receita x Comissão,
// substitui a tabela de ranking (top 5 já vem filtrado de page.tsx).
export function ProfissionaisChart({ ranking }: { ranking: ResumoPorProfissional[] }) {
  if (ranking.length === 0) {
    return <p className="empty-state">Nenhum atendimento lançado no período selecionado.</p>;
  }

  const data = ranking.map((p) => ({
    nome: p.profissional_nome,
    receita: p.total_cobrado,
    comissao: p.total_comissao,
  }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="nome" stroke="var(--text-muted)" fontSize={12} />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={12}
            tickFormatter={(v) => formatarMoeda(Number(v))}
            width={90}
          />
          <Tooltip formatter={(value: number, name: string) => [formatarMoeda(value), name]} contentStyle={tooltipStyle} />
          <Legend />
          <Bar dataKey="receita" name="Receita" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="comissao" name="Comissão" fill="var(--success)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bloco Serviços mais vendidos em gráfico de barras (Receita por serviço).
export function ServicosChart({ servicos }: { servicos: ServicoMaisVendido[] }) {
  if (servicos.length === 0) {
    return <p className="empty-state">Nenhum atendimento lançado no período selecionado.</p>;
  }

  const data = servicos.map((s) => ({
    nome: s.nome,
    receita: s.receita,
    quantidade: s.quantidade,
  }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="nome" stroke="var(--text-muted)" fontSize={12} />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={12}
            tickFormatter={(v) => formatarMoeda(Number(v))}
            width={90}
          />
          <Tooltip
            formatter={(value: number, name: string) => (name === "Receita" ? formatarMoeda(value) : value)}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="receita" name="Receita" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
