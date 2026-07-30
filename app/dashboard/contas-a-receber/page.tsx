"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface ClienteOpcao {
  id: string;
  nome: string;
}

interface ContaReceber {
  id: string;
  cliente_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_recebimento: string | null;
  status: "a_receber" | "recebida";
  clientes: { nome: string } | null;
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Mesma lógica de app/dashboard/contas-a-pagar/page.tsx: dias corridos entre
// o vencimento e hoje, comparando só por data (sem hora).
function diasDeAtraso(dataVencimento: string): number {
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [ano, mes, dia] = dataVencimento.split("-").map(Number);
  const vencimentoUTC = Date.UTC(ano, mes - 1, dia);
  return Math.round((hojeUTC - vencimentoUTC) / 86400000);
}

function statusExibicao(c: ContaReceber): "Recebida" | "Vencida" | "A Receber" {
  if (c.status === "recebida") return "Recebida";
  if (diasDeAtraso(c.data_vencimento) > 0) return "Vencida";
  return "A Receber";
}

export default function ContasAReceberPage() {
  const supabase = createClient();

  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState("");
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
    const [contasRes, clientesRes] = await Promise.all([
      supabase
        .from("contas_receber")
        .select(
          "id, cliente_id, descricao, valor, data_vencimento, data_recebimento, status, clientes ( nome )"
        )
        .order("data_vencimento"),
      supabase.from("clientes").select("id, nome").order("nome"),
    ]);

    if (contasRes.error || clientesRes.error) {
      setErro("Não foi possível carregar as contas a receber.");
    } else {
      setContas((contasRes.data as any) ?? []);
      setClientes((clientesRes.data as ClienteOpcao[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleLancar(e: React.FormEvent) {
    e.preventDefault();

    if (!clienteId || !descricao.trim() || !valor || !dataVencimento) {
      setErro("Preencha cliente, descrição, valor e data de vencimento.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("contas_receber").insert({
        tenant_id: tenantId,
        cliente_id: clienteId,
        descricao: descricao.trim(),
        valor: parseFloat(valor.replace(",", ".")),
        data_vencimento: dataVencimento,
      });

      if (error) {
        setErro("Não foi possível lançar a conta: " + error.message);
        return;
      }

      setErro(null);
      setClienteId("");
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

  async function marcarComoRecebida(id: string) {
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("contas_receber")
      .update({ status: "recebida", data_recebimento: hoje })
      .eq("id", id);

    if (error) {
      setErro("Não foi possível marcar a conta como recebida: " + error.message);
      return;
    }
    carregarTudo();
  }

  const contasEmAtraso = useMemo(
    () =>
      contas
        .filter((c) => c.status === "a_receber" && diasDeAtraso(c.data_vencimento) > 0)
        .sort((a, b) => diasDeAtraso(b.data_vencimento) - diasDeAtraso(a.data_vencimento)),
    [contas]
  );

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Contas a Receber</h1>

      {erro && <p className="alert-error">{erro}</p>}

      <h2 className="section-title">Nova conta a receber</h2>
      <form onSubmit={handleLancar} className="form-row">
        <label className="field">
          Cliente
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
            <option value="">Selecione...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
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
              <th>Cliente</th>
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
                <td>{c.clientes?.nome ?? "-"}</td>
                <td>{c.descricao}</td>
                <td>{formatarMoeda(Number(c.valor))}</td>
                <td>{formatarData(c.data_vencimento)}</td>
                <td>
                  <span className="badge" style={{ color: "var(--danger)", borderColor: "rgba(248, 113, 113, 0.35)" }}>
                    {diasDeAtraso(c.data_vencimento)} dias
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => marcarComoRecebida(c.id)}>
                    Marcar como recebida
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
        <p className="empty-state">Nenhuma conta a receber lançada ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
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
                  <td>{c.clientes?.nome ?? "-"}</td>
                  <td>{c.descricao}</td>
                  <td>{formatarMoeda(Number(c.valor))}</td>
                  <td>{formatarData(c.data_vencimento)}</td>
                  <td>
                    <span
                      className={status === "Recebida" ? "badge badge-accent" : "badge"}
                      style={status === "Vencida" ? { color: "var(--danger)", borderColor: "rgba(248, 113, 113, 0.35)" } : undefined}
                    >
                      {status}
                    </span>
                  </td>
                  <td>
                    {c.status === "a_receber" && (
                      <button className="btn btn-ghost" onClick={() => marcarComoRecebida(c.id)}>
                        Marcar como recebida
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
