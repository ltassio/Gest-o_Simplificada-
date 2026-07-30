"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface FornecedorOpcao {
  id: string;
  nome: string;
}

interface ContaPagar {
  id: string;
  fornecedor_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: "a_pagar" | "paga";
  fornecedores: { nome: string } | null;
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Dias corridos entre a data de vencimento (YYYY-MM-DD) e hoje. Positivo
// significa atraso. Comparamos só por data (sem hora) para não gerar atraso
// de "0 dias e umas horas" no próprio dia do vencimento.
function diasDeAtraso(dataVencimento: string): number {
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [ano, mes, dia] = dataVencimento.split("-").map(Number);
  const vencimentoUTC = Date.UTC(ano, mes - 1, dia);
  return Math.round((hojeUTC - vencimentoUTC) / 86400000);
}

function statusExibicao(c: ContaPagar): "Paga" | "Vencida" | "A Pagar" {
  if (c.status === "paga") return "Paga";
  if (diasDeAtraso(c.data_vencimento) > 0) return "Vencida";
  return "A Pagar";
}

export default function ContasAPagarPage() {
  const supabase = createClient();

  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [fornecedorId, setFornecedorId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarTudo() {
    setCarregando(true);
    const [contasRes, fornecedoresRes] = await Promise.all([
      supabase
        .from("contas_pagar")
        .select(
          "id, fornecedor_id, descricao, valor, data_vencimento, data_pagamento, status, fornecedores ( nome )"
        )
        .order("data_vencimento"),
      supabase.from("fornecedores").select("id, nome").order("nome"),
    ]);

    if (contasRes.error || fornecedoresRes.error) {
      setErro("Não foi possível carregar as contas a pagar.");
    } else {
      setContas((contasRes.data as any) ?? []);
      setFornecedores((fornecedoresRes.data as FornecedorOpcao[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleLancar(e: React.FormEvent) {
    e.preventDefault();

    if (!fornecedorId || !descricao.trim() || !valor || !dataVencimento) {
      setErro("Preencha fornecedor, descrição, valor e data de vencimento.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("contas_pagar").insert({
        tenant_id: tenantId,
        fornecedor_id: fornecedorId,
        descricao: descricao.trim(),
        valor: parseFloat(valor.replace(",", ".")),
        data_vencimento: dataVencimento,
      });

      if (error) {
        setErro("Não foi possível lançar a conta: " + error.message);
        return;
      }

      setErro(null);
      setFornecedorId("");
      setDescricao("");
      setValor("");
      setDataVencimento("");
      carregarTudo();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  async function marcarComoPaga(id: string) {
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("contas_pagar")
      .update({ status: "paga", data_pagamento: hoje })
      .eq("id", id);

    if (error) {
      setErro("Não foi possível marcar a conta como paga: " + error.message);
      return;
    }
    carregarTudo();
  }

  const contasEmAtraso = useMemo(
    () =>
      contas
        .filter((c) => c.status === "a_pagar" && diasDeAtraso(c.data_vencimento) > 0)
        .sort((a, b) => diasDeAtraso(b.data_vencimento) - diasDeAtraso(a.data_vencimento)),
    [contas]
  );

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Contas a Pagar</h1>

      {erro && <p className="alert-error">{erro}</p>}

      <h2 className="section-title">Nova conta a pagar</h2>
      <form onSubmit={handleLancar} className="form-row">
        <label className="field">
          Fornecedor
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} required>
            <option value="">Selecione...</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Descrição
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </label>
        <label className="field">
          Valor (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} required />
        </label>
        <label className="field">
          Vencimento
          <input
            type="date"
            value={dataVencimento}
            onChange={(e) => setDataVencimento(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Lançar"}
        </button>
      </form>

      <h2 className="section-title">Em atraso</h2>
      {contasEmAtraso.length === 0 ? (
        <p className="empty-state">Nenhuma conta em atraso. 🎉</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Dias de atraso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contasEmAtraso.map((c) => (
              <tr key={c.id}>
                <td>{c.fornecedores?.nome ?? "-"}</td>
                <td>{c.descricao}</td>
                <td>{formatarMoeda(Number(c.valor))}</td>
                <td>{formatarData(c.data_vencimento)}</td>
                <td>
                  <span className="badge" style={{ color: "var(--danger)", borderColor: "rgba(248, 113, 113, 0.35)" }}>
                    {diasDeAtraso(c.data_vencimento)} dias
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => marcarComoPaga(c.id)}>
                    Marcar como paga
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Todas as contas</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : contas.length === 0 ? (
        <p className="empty-state">Nenhuma conta a pagar lançada ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => {
              const status = statusExibicao(c);
              return (
                <tr key={c.id}>
                  <td>{c.fornecedores?.nome ?? "-"}</td>
                  <td>{c.descricao}</td>
                  <td>{formatarMoeda(Number(c.valor))}</td>
                  <td>{formatarData(c.data_vencimento)}</td>
                  <td>
                    <span
                      className={status === "Paga" ? "badge badge-accent" : "badge"}
                      style={status === "Vencida" ? { color: "var(--danger)", borderColor: "rgba(248, 113, 113, 0.35)" } : undefined}
                    >
                      {status}
                    </span>
                  </td>
                  <td>
                    {c.status === "a_pagar" && (
                      <button className="btn btn-ghost" onClick={() => marcarComoPaga(c.id)}>
                        Marcar como paga
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
