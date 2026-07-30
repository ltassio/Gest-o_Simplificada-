"use client";

import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
}

interface AtendimentoHistorico {
  id: string;
  data_atendimento: string;
  valor_cobrado: number;
  profissional: { nome: string } | null;
  servico: { nome: string } | null;
}

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Cadastro de Clientes (aba "Cadastro de Parceiro"). Além dos dados básicos,
// mantém o status Ativo/Inativo (mesmo padrão de profissionais.ativo) e um
// histórico de atendimentos expandível por cliente — puxado direto da
// tabela atendimentos (aberta por RLS para qualquer papel do tenant), com
// join em profissionais e servicos só para exibir os nomes.
export default function ClientesPage() {
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [historicoAbertoId, setHistoricoAbertoId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Record<string, AtendimentoHistorico[]>>({});
  const [carregandoHistoricoId, setCarregandoHistoricoId] = useState<string | null>(null);

  useEffect(() => {
    carregarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarClientes() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, telefone, email, ativo")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar os clientes.");
    } else {
      setClientes((data as Cliente[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("Informe o nome do cliente.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("clientes").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        email: email.trim() || null,
      });

      if (error) {
        setErro("Não foi possível salvar o cliente: " + error.message);
        return;
      }

      setErro(null);
      setNome("");
      setTelefone("");
      setEmail("");
      carregarClientes();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(c: Cliente) {
    const { error } = await supabase
      .from("clientes")
      .update({ ativo: !c.ativo })
      .eq("id", c.id);

    if (error) {
      setErro("Não foi possível atualizar o cliente: " + error.message);
      return;
    }
    carregarClientes();
  }

  async function alternarHistorico(clienteId: string) {
    if (historicoAbertoId === clienteId) {
      setHistoricoAbertoId(null);
      return;
    }

    setHistoricoAbertoId(clienteId);

    if (!historico[clienteId]) {
      setCarregandoHistoricoId(clienteId);
      const { data, error } = await supabase
        .from("atendimentos")
        .select(
          "id, data_atendimento, valor_cobrado, profissional:profissionais(nome), servico:servicos(nome)"
        )
        .eq("cliente_id", clienteId)
        .order("data_atendimento", { ascending: false });

      if (error) {
        setErro("Não foi possível carregar o histórico de atendimentos: " + error.message);
      } else {
        setHistorico((prev) => ({
          ...prev,
          [clienteId]: (data as any as AtendimentoHistorico[]) ?? [],
        }));
      }
      setCarregandoHistoricoId(null);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Clientes</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Cadastro, status e histórico de atendimentos de cada cliente.
      </p>

      {erro && <p className="alert-error" style={{ marginTop: 14 }}>{erro}</p>}

      <h2 className="section-title">Novo cliente</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label className="field">
          Telefone
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </label>
        <label className="field">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 className="section-title">Todos os clientes</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : clientes.length === 0 ? (
        <p className="empty-state">Nenhum cliente cadastrado ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Status</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td>{c.nome}</td>
                  <td>{c.telefone ?? "-"}</td>
                  <td>{c.email ?? "-"}</td>
                  <td>
                    <span className={c.ativo ? "badge badge-accent" : "badge"}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => alternarAtivo(c)}>
                      {c.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                  <td>
                    <button className="btn" onClick={() => alternarHistorico(c.id)}>
                      {historicoAbertoId === c.id ? "Ocultar histórico" : "Ver histórico"}
                    </button>
                  </td>
                </tr>
                {historicoAbertoId === c.id && (
                  <tr>
                    <td colSpan={6} style={{ background: "var(--bg-elevated-2)" }}>
                      {carregandoHistoricoId === c.id ? (
                        <p className="empty-state" style={{ padding: "8px 0" }}>
                          Carregando histórico...
                        </p>
                      ) : (historico[c.id] ?? []).length === 0 ? (
                        <p className="empty-state" style={{ padding: "8px 0" }}>
                          Nenhum atendimento registrado para este cliente ainda.
                        </p>
                      ) : (
                        <table className="data-table" style={{ margin: "8px 0" }}>
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Atendente</th>
                              <th>Serviço</th>
                              <th>Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(historico[c.id] ?? []).map((a) => (
                              <tr key={a.id}>
                                <td>{formatarData(a.data_atendimento)}</td>
                                <td>{a.profissional?.nome ?? "-"}</td>
                                <td>{a.servico?.nome ?? "-"}</td>
                                <td>{formatarMoeda(a.valor_cobrado)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
