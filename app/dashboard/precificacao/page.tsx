"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface Servico {
  id: string;
  nome: string;
}
interface Profissional {
  id: string;
  nome: string;
}

interface Detalhamento {
  custo_material: number;
  custo_hora_cadeira: number;
  custo_mao_de_obra: number;
  percentual_comissao: number;
  percentual_imposto: number;
  percentual_margem_desejada: number;
}

interface ResultadoCalculo {
  preco_sugerido: number;
  detalhamento: Detalhamento;
}

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Sub-módulo de Precificação (Documento de Visão do Produto v2.0, Seção
// 5.3): duas partes — a Configuração (parametros_precificacao, um registro
// por tenant, CRUD simples direto no Supabase) e a Calculadora, que chama
// a API Route POST /api/precificacao/calcular porque envolve regra
// financeira que não pode rodar só no navegador (Documentação da API v1.0,
// Seção 6).
export default function PrecificacaoPage() {
  const supabase = createClient();

  // --- Configuração ---
  const [custoFixoMensal, setCustoFixoMensal] = useState("0");
  const [horasProdutivasMes, setHorasProdutivasMes] = useState("0");
  const [percentualImposto, setPercentualImposto] = useState("0");
  const [percentualMargem, setPercentualMargem] = useState("0");
  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [erroConfig, setErroConfig] = useState<string | null>(null);
  const [configSalva, setConfigSalva] = useState(false);

  // --- Calculadora ---
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [servicoId, setServicoId] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [erroCalculo, setErroCalculo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState(false);

  useEffect(() => {
    carregarConfig();
    carregarListas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarConfig() {
    setCarregandoConfig(true);
    const { data, error } = await supabase
      .from("parametros_precificacao")
      .select("custo_fixo_mensal, horas_produtivas_mes, percentual_imposto, percentual_margem_desejada")
      .maybeSingle();

    if (error) {
      setErroConfig("Não foi possível carregar a configuração.");
    } else if (data) {
      setCustoFixoMensal(String(data.custo_fixo_mensal));
      setHorasProdutivasMes(String(data.horas_produtivas_mes));
      setPercentualImposto(String(data.percentual_imposto));
      setPercentualMargem(String(data.percentual_margem_desejada));
    }
    setCarregandoConfig(false);
  }

  async function carregarListas() {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("servicos").select("id, nome").eq("tipo", "servico").order("nome"),
      supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setServicos((s as Servico[]) ?? []);
    setProfissionais((p as Profissional[]) ?? []);
  }

  async function handleSalvarConfig(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoConfig(true);
    setConfigSalva(false);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("parametros_precificacao").upsert(
        {
          tenant_id: tenantId,
          custo_fixo_mensal: Number(custoFixoMensal),
          horas_produtivas_mes: Number(horasProdutivasMes),
          percentual_imposto: Number(percentualImposto),
          percentual_margem_desejada: Number(percentualMargem),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

      if (error) {
        setErroConfig("Não foi possível salvar: " + error.message);
        return;
      }
      setErroConfig(null);
      setConfigSalva(true);
    } catch (e: any) {
      setErroConfig(e.message ?? "Erro inesperado.");
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function handleCalcular(e: React.FormEvent) {
    e.preventDefault();
    setErroCalculo(null);
    setResultado(null);
    setAplicado(false);

    if (!servicoId) {
      setErroCalculo("Selecione um serviço.");
      return;
    }

    setCalculando(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const resp = await fetch("/api/precificacao/calcular", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          servico_id: servicoId,
          profissional_id: profissionalId || undefined,
        }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        setErroCalculo(json?.erro?.mensagem ?? "Não foi possível calcular o preço.");
        return;
      }

      setResultado(json as ResultadoCalculo);
    } catch (e: any) {
      setErroCalculo(e.message ?? "Erro inesperado ao calcular.");
    } finally {
      setCalculando(false);
    }
  }

  async function handleUsarPreco() {
    if (!resultado || !servicoId) return;
    setAplicando(true);
    const { error } = await supabase
      .from("servicos")
      .update({ preco: resultado.preco_sugerido })
      .eq("id", servicoId);
    setAplicando(false);

    if (error) {
      setErroCalculo("Não foi possível aplicar o preço: " + error.message);
      return;
    }
    setAplicado(true);
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Precificação</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Preço sugerido = (custo do material + custo-hora de cadeira × duração) ÷ (1 − comissão − imposto − margem).
      </p>

      <h2 className="section-title">Configuração</h2>
      {carregandoConfig ? (
        <p className="empty-state">Carregando...</p>
      ) : (
        <form onSubmit={handleSalvarConfig} className="form-row">
          <label className="field">
            Custo fixo mensal (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              value={custoFixoMensal}
              onChange={(e) => setCustoFixoMensal(e.target.value)}
            />
          </label>
          <label className="field">
            Horas produtivas/mês
            <input
              type="number"
              min={0}
              step="0.01"
              value={horasProdutivasMes}
              onChange={(e) => setHorasProdutivasMes(e.target.value)}
            />
          </label>
          <label className="field">
            Imposto (%)
            <input
              type="number"
              min={0}
              max={99}
              step="0.01"
              value={percentualImposto}
              onChange={(e) => setPercentualImposto(e.target.value)}
            />
          </label>
          <label className="field">
            Margem desejada (%)
            <input
              type="number"
              min={0}
              max={99}
              step="0.01"
              value={percentualMargem}
              onChange={(e) => setPercentualMargem(e.target.value)}
            />
          </label>
          <button type="submit" disabled={salvandoConfig} className="btn btn-primary">
            {salvandoConfig ? "Salvando..." : "Salvar configuração"}
          </button>
        </form>
      )}
      {erroConfig && <p className="alert-error">{erroConfig}</p>}
      {configSalva && (
        <p style={{ color: "var(--success)", fontSize: 13 }}>Configuração salva.</p>
      )}

      <h2 className="section-title">Calculadora</h2>
      <form onSubmit={handleCalcular} className="form-row">
        <label className="field">
          Serviço
          <select value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
            <option value="">Selecione</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Profissional (opcional)
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
            <option value="">Sem profissional específica</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={calculando} className="btn btn-primary">
          {calculando ? "Calculando..." : "Calcular preço sugerido"}
        </button>
      </form>

      {erroCalculo && <p className="alert-error">{erroCalculo}</p>}

      {resultado && (
        <div className="card" style={{ marginTop: 16, padding: 24 }}>
          <div className="card-subtitle" style={{ marginBottom: 4 }}>
            Preço sugerido
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>
            {formatarMoeda(resultado.preco_sugerido)}
          </div>

          <table className="data-table" style={{ marginBottom: 16 }}>
            <tbody>
              <tr>
                <td>Custo do material</td>
                <td>{formatarMoeda(resultado.detalhamento.custo_material)}</td>
              </tr>
              <tr>
                <td>Custo-hora de cadeira</td>
                <td>{formatarMoeda(resultado.detalhamento.custo_hora_cadeira)}</td>
              </tr>
              <tr>
                <td>Custo de mão de obra (tempo do serviço)</td>
                <td>{formatarMoeda(resultado.detalhamento.custo_mao_de_obra)}</td>
              </tr>
              <tr>
                <td>Comissão considerada</td>
                <td>{resultado.detalhamento.percentual_comissao}%</td>
              </tr>
              <tr>
                <td>Imposto</td>
                <td>{resultado.detalhamento.percentual_imposto}%</td>
              </tr>
              <tr>
                <td>Margem desejada</td>
                <td>{resultado.detalhamento.percentual_margem_desejada}%</td>
              </tr>
            </tbody>
          </table>

          <button className="btn btn-primary" onClick={handleUsarPreco} disabled={aplicando}>
            {aplicando ? "Aplicando..." : "Usar este preço no serviço"}
          </button>
          {aplicado && (
            <p style={{ color: "var(--success)", fontSize: 13, marginTop: 8 }}>
              Preço atualizado no cadastro do serviço.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
