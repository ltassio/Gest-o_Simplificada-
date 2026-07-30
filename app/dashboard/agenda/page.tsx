"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface Cliente {
  id: string;
  nome: string;
}
interface Profissional {
  id: string;
  nome: string;
}
interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
}
interface Agendamento {
  id: string;
  data_hora_inicio: string;
  status: string;
  clientes: { nome: string } | null;
  profissionais: { nome: string } | null;
  servicos: { nome: string } | null;
}

// Agenda simples do MVP (Documento de Visão do Produto, Seção 6): lista os
// agendamentos de um dia e permite criar um novo. Fala direto com o
// Supabase via PostgREST (protegido por RLS) — decisão de arquitetura
// registrada no Documento de Arquitetura Técnica v1.0, Seção 4: CRUDs
// simples não passam por API Routes dedicadas.
export default function AgendaPage() {
  const supabase = createClient();

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [hora, setHora] = useState("09:00");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarListasBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregarAgendamentosDoDia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function carregarListasBase() {
    const [{ data: c }, { data: p }, { data: s }] = await Promise.all([
      supabase.from("clientes").select("id, nome").order("nome"),
      supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("servicos").select("id, nome, duracao_minutos").order("nome"),
    ]);
    setClientes((c as Cliente[]) ?? []);
    setProfissionais((p as Profissional[]) ?? []);
    setServicos((s as Servico[]) ?? []);
  }

  async function carregarAgendamentosDoDia() {
    setCarregando(true);
    const inicio = `${data}T00:00:00`;
    const fim = `${data}T23:59:59`;

    const { data: rows, error } = await supabase
      .from("agendamentos")
      .select(
        "id, data_hora_inicio, status, clientes(nome), profissionais(nome), servicos(nome)"
      )
      .gte("data_hora_inicio", inicio)
      .lte("data_hora_inicio", fim)
      .order("data_hora_inicio");

    if (error) {
      setErro("Não foi possível carregar a agenda.");
    } else {
      setAgendamentos((rows as unknown as Agendamento[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!clienteId || !profissionalId || !servicoId) {
      setErro("Selecione cliente, profissional e serviço.");
      return;
    }

    const servico = servicos.find((s) => s.id === servicoId);
    const duracao = servico?.duracao_minutos ?? 30;

    const inicio = new Date(`${data}T${hora}:00`);
    const fimDate = new Date(inicio.getTime() + duracao * 60000);

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("agendamentos").insert({
        tenant_id: tenantId,
        cliente_id: clienteId,
        profissional_id: profissionalId,
        servico_id: servicoId,
        data_hora_inicio: inicio.toISOString(),
        data_hora_fim: fimDate.toISOString(),
      });

      if (error) {
        setErro("Não foi possível criar o agendamento: " + error.message);
        return;
      }

      setErro(null);
      setClienteId("");
      setProfissionalId("");
      setServicoId("");
      carregarAgendamentosDoDia();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Agenda</h1>

      <label className="field" style={{ maxWidth: 200 }}>
        Dia
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </label>

      {erro && <p className="alert-error">{erro}</p>}

      <h2 className="section-title">Novo agendamento</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Cliente
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Profissional
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
            <option value="">Selecione</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
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
          Hora
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Agendar"}
        </button>
      </form>

      <h2 className="section-title">Agendamentos do dia</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : agendamentos.length === 0 ? (
        <p className="empty-state">Nenhum agendamento para esse dia.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Cliente</th>
              <th>Profissional</th>
              <th>Serviço</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {agendamentos.map((a) => (
              <tr key={a.id}>
                <td>
                  {new Date(a.data_hora_inicio).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td>{a.clientes?.nome ?? "-"}</td>
                <td>{a.profissionais?.nome ?? "-"}</td>
                <td>{a.servicos?.nome ?? "-"}</td>
                <td>
                  <span className="badge badge-accent">{a.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
