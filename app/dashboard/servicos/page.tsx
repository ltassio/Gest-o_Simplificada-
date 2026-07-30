"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
  custo_material: number;
  preco: number;
  categoria: string | null;
  tipo: "servico" | "produto";
}

const TIPO_LABEL: Record<string, string> = {
  servico: "Serviço",
  produto: "Produto",
};

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Cadastro de Produtos e Serviços (aba "Produto e Serviço"): mesma tabela
// "servicos" de sempre, agora com a coluna tipo ('servico' | 'produto') para
// diferenciar os dois no mesmo cadastro. Duração e custo de material só
// fazem sentido para serviço (alimentam a calculadora de Precificação);
// produto normalmente fica com duração 0.
export default function ServicosPage() {
  const supabase = createClient();

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"servico" | "produto">("servico");
  const [nome, setNome] = useState("");
  const [duracao, setDuracao] = useState("30");
  const [custoMaterial, setCustoMaterial] = useState("0");
  const [preco, setPreco] = useState("0");
  const [categoria, setCategoria] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarServicos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarServicos() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("servicos")
      .select("id, nome, duracao_minutos, custo_material, preco, categoria, tipo")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar os produtos e serviços.");
    } else {
      setServicos((data as Servico[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro(`Informe o nome do ${tipo === "produto" ? "produto" : "serviço"}.`);
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("servicos").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
        duracao_minutos: Number(duracao),
        custo_material: Number(custoMaterial),
        preco: Number(preco),
        categoria: categoria.trim() || null,
        tipo,
      });

      if (error) {
        setErro("Não foi possível salvar: " + error.message);
        return;
      }

      setErro(null);
      setNome("");
      setDuracao("30");
      setCustoMaterial("0");
      setPreco("0");
      setCategoria("");
      carregarServicos();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Produtos e Serviços</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Duração e custo de material de serviços alimentam a calculadora de{" "}
        <a href="/dashboard/precificacao" style={{ color: "var(--accent)" }}>
          Precificação
        </a>
        .
      </p>

      {erro && <p className="alert-error" style={{ marginTop: 14 }}>{erro}</p>}

      <h2 className="section-title">Novo cadastro</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "servico" | "produto")}>
            <option value="servico">Serviço</option>
            <option value="produto">Produto</option>
          </select>
        </label>
        <label className="field">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        {tipo === "servico" && (
          <>
            <label className="field">
              Duração (min)
              <input
                type="number"
                min={1}
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
              />
            </label>
            <label className="field">
              Custo material (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={custoMaterial}
                onChange={(e) => setCustoMaterial(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="field">
          Preço (R$)
          <input
            type="number"
            min={0}
            step="0.01"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
          />
        </label>
        <label className="field">
          Categoria
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="opcional"
          />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 className="section-title">Todos os cadastros</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : servicos.length === 0 ? (
        <p className="empty-state">Nenhum produto ou serviço cadastrado ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Nome</th>
              <th>Duração</th>
              <th>Custo material</th>
              <th>Preço</th>
              <th>Categoria</th>
            </tr>
          </thead>
          <tbody>
            {servicos.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className={s.tipo === "produto" ? "badge" : "badge badge-accent"}>
                    {TIPO_LABEL[s.tipo] ?? s.tipo}
                  </span>
                </td>
                <td>{s.nome}</td>
                <td>{s.tipo === "servico" ? `${s.duracao_minutos} min` : "-"}</td>
                <td>{s.tipo === "servico" ? formatarMoeda(s.custo_material) : "-"}</td>
                <td>{formatarMoeda(s.preco)}</td>
                <td>{s.categoria ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
