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
//
// Editar/Excluir (pedido do usuário em 30/07/2026): edição é inline na
// própria linha da tabela (mesmo padrão de "trocar por inputs" já usado em
// outras telas do projeto), e exclusão pede confirmação e trata o caso de o
// cadastro já ter sido usado em algum atendimento — nesse caso o Postgres
// bloqueia a exclusão por causa da chave estrangeira (constraint), então
// mostramos uma mensagem amigável em vez do erro cru do banco.
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

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edTipo, setEdTipo] = useState<"servico" | "produto">("servico");
  const [edNome, setEdNome] = useState("");
  const [edDuracao, setEdDuracao] = useState("30");
  const [edCustoMaterial, setEdCustoMaterial] = useState("0");
  const [edPreco, setEdPreco] = useState("0");
  const [edCategoria, setEdCategoria] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [excluindoId, setExcluindoId] = useState<string | null>(null);

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

  function iniciarEdicao(s: Servico) {
    setErro(null);
    setEditandoId(s.id);
    setEdTipo(s.tipo);
    setEdNome(s.nome);
    setEdDuracao(String(s.duracao_minutos ?? 0));
    setEdCustoMaterial(String(s.custo_material ?? 0));
    setEdPreco(String(s.preco ?? 0));
    setEdCategoria(s.categoria ?? "");
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(id: string) {
    if (!edNome.trim()) {
      setErro(`Informe o nome do ${edTipo === "produto" ? "produto" : "serviço"}.`);
      return;
    }

    setSalvandoEdicao(true);
    try {
      const { error } = await supabase
        .from("servicos")
        .update({
          nome: edNome.trim(),
          duracao_minutos: Number(edDuracao),
          custo_material: Number(edCustoMaterial),
          preco: Number(edPreco),
          categoria: edCategoria.trim() || null,
          tipo: edTipo,
        })
        .eq("id", id);

      if (error) {
        setErro("Não foi possível salvar as alterações: " + error.message);
        return;
      }

      setErro(null);
      setEditandoId(null);
      carregarServicos();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluir(s: Servico) {
    const confirmado = window.confirm(
      `Excluir "${s.nome}"? Essa ação não pode ser desfeita.`
    );
    if (!confirmado) return;

    setExcluindoId(s.id);
    try {
      const { error } = await supabase.from("servicos").delete().eq("id", s.id);

      if (error) {
        // Postgres bloqueia a exclusão (foreign key) quando o cadastro já
        // foi usado em algum atendimento — código 23503 é violação de
        // chave estrangeira.
        if (error.code === "23503") {
          setErro(
            `Não é possível excluir "${s.nome}": já existem atendimentos lançados com este cadastro. Você pode editá-lo em vez de excluir.`
          );
        } else {
          setErro(`Não foi possível excluir "${s.nome}": ` + error.message);
        }
        return;
      }

      setErro(null);
      if (editandoId === s.id) setEditandoId(null);
      carregarServicos();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setExcluindoId(null);
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {servicos.map((s) =>
              editandoId === s.id ? (
                <tr key={s.id} style={{ background: "var(--bg-elevated-2)" }}>
                  <td>
                    <select
                      value={edTipo}
                      onChange={(e) => setEdTipo(e.target.value as "servico" | "produto")}
                    >
                      <option value="servico">Serviço</option>
                      <option value="produto">Produto</option>
                    </select>
                  </td>
                  <td>
                    <input value={edNome} onChange={(e) => setEdNome(e.target.value)} />
                  </td>
                  <td>
                    {edTipo === "servico" ? (
                      <input
                        type="number"
                        min={1}
                        style={{ width: 80 }}
                        value={edDuracao}
                        onChange={(e) => setEdDuracao(e.target.value)}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {edTipo === "servico" ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        style={{ width: 90 }}
                        value={edCustoMaterial}
                        onChange={(e) => setEdCustoMaterial(e.target.value)}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      style={{ width: 90 }}
                      value={edPreco}
                      onChange={(e) => setEdPreco(e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      style={{ width: 110 }}
                      value={edCategoria}
                      onChange={(e) => setEdCategoria(e.target.value)}
                      placeholder="opcional"
                    />
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn btn-primary"
                      disabled={salvandoEdicao}
                      onClick={() => salvarEdicao(s.id)}
                    >
                      {salvandoEdicao ? "Salvando..." : "Salvar"}
                    </button>
                    <button className="btn btn-ghost" onClick={cancelarEdicao}>
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
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
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => iniciarEdicao(s)}>
                      Editar
                    </button>
                    <button
                      className="btn"
                      style={{ color: "var(--danger)" }}
                      disabled={excluindoId === s.id}
                      onClick={() => excluir(s)}
                    >
                      {excluindoId === s.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
