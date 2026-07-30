"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";
import { NATUREZA_DRE_LABEL, ORDEM_NATUREZA_DRE, type NaturezaDre } from "@/lib/dre";

interface PlanoConta {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  natureza_dre: NaturezaDre;
  ativo: boolean;
}

// Plano de Contas (módulo Financeiro, Fase 1): cadastro-base para
// categorizar Contas a Pagar/Receber e, na Fase 3, montar a DRE completa
// automaticamente (cada conta já nasce marcada com a linha da DRE a que
// pertence — natureza_dre). Já vem semeado com um plano de contas padrão
// para negócio de serviços (ver migration 004_financeiro_fase1.sql) —
// esta tela serve para ajustar/adicionar contas.
export default function PlanoContasPage() {
  const supabase = createClient();

  const [contas, setContas] = useState<PlanoConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [naturezaDre, setNaturezaDre] = useState<NaturezaDre>("despesa_operacional");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("plano_contas")
      .select("id, nome, tipo, natureza_dre, ativo")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar o plano de contas.");
    } else {
      setContas((data as PlanoConta[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("Informe o nome da conta.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("plano_contas").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
        tipo,
        natureza_dre: naturezaDre,
      });

      if (error) {
        setErro("Não foi possível salvar: " + error.message);
        return;
      }

      setErro(null);
      setNome("");
      carregar();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(c: PlanoConta) {
    const { error } = await supabase.from("plano_contas").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) {
      setErro("Não foi possível atualizar: " + error.message);
      return;
    }
    carregar();
  }

  const contasPorNatureza = useMemo(() => {
    const grupos = new Map<NaturezaDre, PlanoConta[]>();
    for (const c of contas) {
      const lista = grupos.get(c.natureza_dre) ?? [];
      lista.push(c);
      grupos.set(c.natureza_dre, lista);
    }
    return grupos;
  }, [contas]);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Plano de Contas</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Categorias usadas em Contas a Pagar/Receber e, em breve, na DRE.
      </p>

      {erro && (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      )}

      <h2 className="section-title">Nova conta</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Manutenção de Equipamentos"
            required
          />
        </label>
        <label className="field">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "receita" | "despesa")}>
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </select>
        </label>
        <label className="field">
          Linha da DRE
          <select value={naturezaDre} onChange={(e) => setNaturezaDre(e.target.value as NaturezaDre)}>
            {ORDEM_NATUREZA_DRE.map((n) => (
              <option key={n} value={n}>
                {NATUREZA_DRE_LABEL[n]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : contas.length === 0 ? (
        <p className="empty-state">Nenhuma conta cadastrada ainda.</p>
      ) : (
        ORDEM_NATUREZA_DRE.filter((n) => contasPorNatureza.has(n)).map((n) => (
          <div key={n}>
            <h2 className="section-title">{NATUREZA_DRE_LABEL[n]}</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contasPorNatureza.get(n)!.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>{c.tipo === "receita" ? "Receita" : "Despesa"}</td>
                    <td>
                      <span className={c.ativo ? "badge badge-accent" : "badge"}>
                        {c.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => alternarAtivo(c)}>
                        {c.ativo ? "Desativar" : "Reativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
