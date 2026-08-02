"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPCOES = [
  { value: "mes_atual", label: "Este mês" },
  { value: "mes_anterior", label: "Mês passado" },
  { value: "7_dias", label: "Últimos 7 dias" },
  { value: "30_dias", label: "Últimos 30 dias" },
  { value: "personalizado", label: "Personalizado" },
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
//
// Opção "Personalizado" adicionada em 01/08/2026 a pedido do usuário — ao
// selecioná-la, aparecem dois campos de data (De/Até) que escrevem
// diretamente nos query params "inicio" e "fim" (formato YYYY-MM-DD, lido
// por calcularPeriodo em app/dashboard/page.tsx). inicioAtual/fimAtual
// vêm do server component já calculados (nunca vazios), tanto para
// preencher os campos quando o usuário está em "Personalizado" quanto
// para servir de ponto de partida quando ele troca pra essa opção vindo de
// outro período.
// Formata a data de HOJE (no fuso do navegador do usuário) como
// "YYYY-MM-DD", pro valor inicial do campo "Até" quando o usuário troca pra
// "Personalizado" — recalculada a cada clique, nunca um valor fixo/cacheado.
function formatarHoje(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export default function PeriodoFiltro({
  valorAtual,
  inicioAtual,
  fimAtual,
}: {
  valorAtual: string;
  inicioAtual: string;
  fimAtual: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handlePeriodoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const novoPeriodo = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", novoPeriodo);

    if (novoPeriodo === "personalizado") {
      // Abre sempre a partir de hoje (data dinâmica, recalculada no momento
      // do clique) — não herda as datas do período que estava selecionado
      // antes, pra não parecer "travado" numa data antiga.
      const hoje = formatarHoje();
      params.set("inicio", hoje);
      params.set("fim", hoje);
    } else {
      params.delete("inicio");
      params.delete("fim");
    }

    router.push(`/dashboard?${params.toString()}`);
  }

  function handleDataChange(campo: "inicio" | "fim", valor: string) {
    if (!valor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", "personalizado");
    params.set(campo, valor);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label className="field" style={{ marginBottom: 0, minWidth: 180 }}>
        Período
        <select value={valorAtual} onChange={handlePeriodoChange}>
          {OPCOES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {valorAtual === "personalizado" && (
        <>
          <label className="field" style={{ marginBottom: 0 }}>
            De
            <input
              type="date"
              value={inicioAtual}
              max={fimAtual}
              onChange={(e) => handleDataChange("inicio", e.target.value)}
            />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            Até
            <input
              type="date"
              value={fimAtual}
              min={inicioAtual}
              onChange={(e) => handleDataChange("fim", e.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}
