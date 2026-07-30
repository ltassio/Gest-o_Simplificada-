"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface FormaPagamento {
  id: string;
  nome: string;
  ativa: boolean;
}

// Cadastro de Formas de Pagamento (módulo Financeiro, Fase 1). Alimenta os
// selects de "forma de pagamento" em Contas a Pagar/Receber e, nas
// próximas fases, o Caixa (abertura/fechamento) e a conciliação da DRE.
// Vêm 6 formas já cadastradas por padrão (ver migration
// 004_financeiro_fase1.sql) — esta tela serve para ajustar/adicionar.
export default function FormasPagamentoPage() {
  const supabase = createClient();

  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("formas_pagamento")
      .select("id, nome, ativa")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar as formas de pagamento.");
    } else {
      setFormas((data as FormaPagamento[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("Informe o nome da forma de pagamento.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("formas_pagamento").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
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

  async function alternarAtiva(f: FormaPagamento) {
    const { error } = await supabase
      .from("formas_pagamento")
      .update({ ativa: !f.ativa })
      .eq("id", f.id);

    if (error) {
      setErro("Não foi possível atualizar: " + error.message);
      return;
    }
    carregar();
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Formas de Pagamento</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Usadas ao lançar Contas a Pagar/Receber e, em breve, no Caixa.
      </p>

      {erro && (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      )}

      <h2 className="section-title">Nova forma de pagamento</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Vale-alimentação"
            required
          />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 className="section-title">Todas as formas de pagamento</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : formas.length === 0 ? (
        <p className="empty-state">Nenhuma forma de pagamento cadastrada ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {formas.map((f) => (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td>
                  <span className={f.ativa ? "badge badge-accent" : "badge"}>
                    {f.ativa ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => alternarAtiva(f)}>
                    {f.ativa ? "Desativar" : "Reativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
