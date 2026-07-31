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
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { AgendaResumo, ClientesResumo, ServicoMaisVendido } from "@/lib/dashboard";
import type { ResumoPorProfissional } from "@/lib/caixa";

// Paleta dedicada a gráficos (diferente da paleta semântica da UI —
// --accent/--success/--danger/--warning continuam reservados para estado
// (alertas, botões etc.)). Redesenho pedido pelo usuário em 30/07/2026:
// cores mais distintas entre si (boa leitura lado a lado), acessíveis em
// contraste sobre o fundo escuro do tema.
const CHART_1 = "#818cf8"; // índigo
const CHART_2 = "#34d399"; // esmeralda
const CHART_3 = "#fbbf24"; // âmbar
const CHART_4 = "#fb7185"; // rosa
const CHART_5 = "#22d3ee"; // ciano
const CHART_6 = "#c084fc"; // violeta

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function truncar(nome: string, max = 16) {
  return nome.length > max ? `${nome.slice(0, max - 1)}…` : nome;
}

const tooltipStyle = {
  background: "var(--bg-elevated-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
};

const valorLabelStyle = { fill: "var(--text)", fontSize: 12, fontWeight: 600 };
const nomeLabelStyle = { fill: "var(--text-muted)", fontSize: 12 };

// Bloco Agenda: donut com o total no centro (padrão comum de BI para
// leitura rápida do todo) + legenda em chips coloridos com contagem, no
// lugar da legenda padrão do recharts. Taxa de cancelamento vira um selo
// separado — é uma razão calculada, não uma fatia do gráfico.
export function AgendaChart({ resumo }: { resumo: AgendaResumo }) {
  const data = [
    { name: "Agendados", value: resumo.agendados, color: CHART_1 },
    { name: "Concluídos", value: resumo.concluidos, color: CHART_2 },
    { name: "Cancelados", value: resumo.cancelados, color: CHART_4 },
  ].filter((d) => d.value > 0);

  if (resumo.total === 0) {
    return <p className="empty-state">Nenhum agendamento no período selecionado.</p>;
  }

  return (
    <div>
      <div className="donut-wrap" style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={64}
              outerRadius={92}
              paddingAngle={3}
              stroke="var(--bg-elevated)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} wrapperStyle={{ zIndex: 20 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <div className="donut-center-value">{resumo.total}</div>
          <div className="donut-center-label">agendamentos</div>
        </div>
      </div>
      <div className="chart-legend">
        {data.map((d) => (
          <span className="chart-legend-item" key={d.name}>
            <span className="chart-legend-dot" style={{ background: d.color }} />
            {d.name} <strong className="chart-legend-value">{d.value}</strong>
          </span>
        ))}
        <span className="chart-legend-item">
          Taxa de cancelamento <strong className="chart-legend-value">{resumo.taxa_cancelamento}%</strong>
        </span>
      </div>
    </div>
  );
}

// Bloco Clientes: barras horizontais (melhor leitura para poucas categorias
// nomeadas — não obriga o olho a girar para ler o rótulo) com o valor já
// escrito na ponta da barra.
export function ClientesChart({ resumo }: { resumo: ClientesResumo }) {
  const data = [
    { name: "Ativos", valor: resumo.ativos, color: CHART_2 },
    { name: "Novos no período", valor: resumo.novos_periodo, color: CHART_1 },
    { name: "Inativos", valor: resumo.inativos, color: CHART_4 },
  ];
  // domain com folga de 25% acima do maior valor: sem isso a barra do maior
  // valor encosta na borda do gráfico e o rótulo (LabelList, posicionado
  // "right") fica cortado fora da área visível — foi encontrado assim no
  // teste em produção (barra de "Ativos"/"Novos no período" sem número).
  const max = Math.max(1, ...data.map((d) => d.valor));
  const domainMax = Math.max(1, Math.ceil(max * 1.25));

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 36, left: 4, bottom: 4 }}
          barCategoryGap={18}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" domain={[0, domainMax]} hide />
          <YAxis
            type="category"
            dataKey="name"
            stroke="var(--text-muted)"
            fontSize={12}
            width={110}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number) => [value, "Clientes"]}
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--bg-elevated-2)" }}
          />
          <Bar dataKey="valor" name="Clientes" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
            <LabelList dataKey="valor" position="right" style={valorLabelStyle} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bloco Profissionais: ranking em barras horizontais agrupadas (Receita x
// Comissão) — nomes de profissional podem ser longos, então o layout
// horizontal evita rótulo cortado/rotacionado no eixo X.
export function ProfissionaisChart({ ranking }: { ranking: ResumoPorProfissional[] }) {
  if (ranking.length === 0) {
    return <p className="empty-state">Nenhum atendimento lançado no período selecionado.</p>;
  }

  const data = ranking.map((p) => ({
    nomeCompleto: p.profissional_nome,
    nome: truncar(p.profissional_nome, 13),
    receita: p.total_cobrado,
    comissao: p.total_comissao,
  }));
  // domain com folga de 25% acima do maior valor (mesmo problema já
  // encontrado no gráfico de Clientes: sem folga, a barra do maior valor
  // encosta na borda e o rótulo em LabelList "right" fica cortado — visto
  // em QA de produção com "R$ 379,12" cortado para "R$ 379,1").
  const maxProfissionais = Math.max(1, ...data.map((d) => Math.max(d.receita, d.comissao)));
  const domainMaxProfissionais = Math.max(1, Math.ceil(maxProfissionais * 1.25));

  return (
    <div style={{ width: "100%", height: Math.max(160, data.length * 64) }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 72, left: 4, bottom: 4 }}
          barCategoryGap={22}
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" domain={[0, domainMaxProfissionais]} hide />
          <YAxis
            type="category"
            dataKey="nome"
            stroke="var(--text-muted)"
            fontSize={12}
            width={110}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatarMoeda(value), name]}
            labelFormatter={(_, entries) => entries?.[0]?.payload?.nomeCompleto ?? ""}
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--bg-elevated-2)" }}
          />
          <Bar dataKey="receita" name="Receita" fill={CHART_1} radius={[0, 6, 6, 0]} maxBarSize={16}>
            <LabelList
              dataKey="receita"
              position="right"
              formatter={(v: number) => formatarMoeda(v)}
              style={valorLabelStyle}
            />
          </Bar>
          <Bar dataKey="comissao" name="Comissão" fill={CHART_2} radius={[0, 6, 6, 0]} maxBarSize={16}>
            <LabelList
              dataKey="comissao"
              position="right"
              formatter={(v: number) => formatarMoeda(v)}
              style={nomeLabelStyle}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-dot" style={{ background: CHART_1 }} />
          Receita
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-dot" style={{ background: CHART_2 }} />
          Comissão
        </span>
      </div>
    </div>
  );
}

// Bloco Serviços mais vendidos: barra horizontal única (Receita), ordenada
// do maior para o menor (já vem assim de lib/dashboard.ts), com a
// quantidade de atendimentos como texto secundário ao lado do nome.
export function ServicosChart({ servicos }: { servicos: ServicoMaisVendido[] }) {
  if (servicos.length === 0) {
    return <p className="empty-state">Nenhum atendimento lançado no período selecionado.</p>;
  }

  const data = servicos.map((s, i) => ({
    nomeCompleto: s.nome,
    nome: `${truncar(s.nome, 11)} · ${s.quantidade}×`,
    receita: s.receita,
    color: [CHART_5, CHART_1, CHART_6, CHART_3, CHART_2][i % 5],
  }));
  // mesma folga de 25% aplicada em Clientes/Profissionais, por precaução
  // (o mesmo corte de rótulo já apareceu em mais de um gráfico sem domain
  // explícito).
  const maxServicos = Math.max(1, ...data.map((d) => d.receita));
  const domainMaxServicos = Math.max(1, Math.ceil(maxServicos * 1.25));

  return (
    <div style={{ width: "100%", height: Math.max(160, data.length * 56) }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 64, left: 4, bottom: 4 }}
          barCategoryGap={18}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" domain={[0, domainMaxServicos]} hide />
          <YAxis
            type="category"
            dataKey="nome"
            stroke="var(--text-muted)"
            fontSize={12}
            width={150}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number) => [formatarMoeda(value), "Receita"]}
            labelFormatter={(_, entries) => entries?.[0]?.payload?.nomeCompleto ?? ""}
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--bg-elevated-2)" }}
          />
          <Bar dataKey="receita" radius={[0, 6, 6, 0]} maxBarSize={24}>
            {data.map((d) => (
              <Cell key={d.nomeCompleto} fill={d.color} />
            ))}
            <LabelList dataKey="receita" position="right" formatter={(v: number) => formatarMoeda(v)} style={valorLabelStyle} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
