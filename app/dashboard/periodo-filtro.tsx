"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPCOES = [
  { value: "mes_atual", label: "Este mês" },
  { value: "mes_anterior", label: "Mês passado" },
  { value: "7_dias", label: "Últimos 7 dias" },
  { value: "30_dias", label: "Últimos 30 dias" },
];

// Filtro global de Período do Dashboard Executivo (EF-001, Seção 9 —
// "Filtros": Empresa, Unidade, Período, Profissional, Serviço, Cliente,
// Categoria, Forma de Pagamento e Conta). Nesta fase só Período foi
// implementado — é o filtro que a EF cita em todo o fluxo principal
// (Seção 5: "Seleção de filtros > Consulta de indicadores") e o mais
// simples de aplicar de forma consistente em todos os blocos de uma vez;
// os demais filtros (Profissional, Serviço, Cliente etc.) exigiriam
// reescrever cada consulta do dashboard para aceitar múltiplos filtros
// combinados — fica para uma próxima iteração.
export default function PeriodoFiltro({ valorAtual }: { valorAtual: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", e.target.value);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <label className="field" style={{ marginBottom: 0, minWidth: 180 }}>
      Período
      <select value={valorAtual} onChange={handleChange}>
        {OPCOES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
