"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AgendamentoPendente {
  id: string;
  data_hora_inicio: string;
  cliente_id: string;
  profissional_id: string;
  servico_id: string;
  clientes: { nome: string } | null;
  profissionais: { nome: string } | null;
  servicos: { nome: string; preco: number } | null;
}

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
  preco: number;
}

interface AtendimentoRecente {
  id: string;
  valor_cobrado: number;
  valor_comissao: number;
  valor_estudio: number;
  data_atendimento: string;
  clientes: { nome: string } | null;
  profissionais: { nome: string } | null;
  servicos: { nome: string } | null;
}

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Caixa: a operação central do MVP (Documento de Visão do Produto v2.0,
// Seção 2 — dor nº1 do piloto). Registrar um atendimento SEMPRE passa pela
// API Route POST /api/caixa/atendimentos, que calcula o split de comissão
// no servidor (nunca no navegador) — decisão registrada na Documentação
// da API v1.0, Seção 6.
export default function CaixaPage() {
  const supabase = createClient();

  const [pendentes, setPendentes] = useState<AgendamentoPendente[]>([]);
  const [recentes, setRecentes] = useState<AtendimentoRecente[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState<AgendamentoPendente | null>(
    null
  );
  const [valorAgendamento, setValorAgendamento] = useState("");
  const [lancandoAgendamento, setLancandoAgendamento] = useState(false);

  const [clienteAvulsoId, setClienteAvulsoId] = useState("");
  const [profissionalAvulsoId, setProfissionalAvulsoId] = useState("");
  const [servicoAvulsoId, setServicoAvulsoId] = useState("");
  const [valorAvulso, setValorAvulso] = useState("");
  const [lancandoAvulso, setLancandoAvulso] = useState(false);

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarTudo() {
    setCarregando(true);

    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date();
    hojeFim.setHours(23, 59, 59, 999);

    const [{ data: pend }, { data: rec }, { data: c }, { data: p }, { data: s }] = await Promise.all([
      supabase
        .from("agendamentos")
        .select(
          "id, data_hora_inicio, cliente_id, profissional_id, servico_id, clientes(nome), profissionais(nome), servicos(nome, preco)"
        )
        .eq("status", "agendado")
        .gte("data_hora_inicio", hojeInicio.toISOString())
        .lte("data_hora_inicio", hojeFim.toISOString())
        .order("data_hora_inicio"),
      supabase
        .from("atendimentos")
        .select(
          "id, valor_cobrado, valor_comissao, valor_estudio, data_atendimento, clientes(nome), profissionais(nome), servicos(nome)"
        )
        .order("data_atendimento", { ascending: false })
        .limit(20),
      supabase.from("clientes").select("id, nome").order("nome"),
      supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("servicos").select("id, nome, preco").order("nome"),
    ]);

    setPendentes((pend as unknown as AgendamentoPendente[]) ?? []);
    setRecentes((rec as unknown as AtendimentoRecente[]) ?? []);
    setClientes((c as Cliente[]) ?? []);
    setProfissionais((p as Profissional[]) ?? []);
    setServicos((s as Servico[]) ?? []);
    setCarregando(false);
  }

  async function registrarAtendimento(payload: {
    cliente_id: string;
    profissional_id: string;
    servico_id: string;
    valor_cobrado: number;
    agendamento_id?: string;
  }) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const resp = await fetch("/api/caixa/atendimentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json();

    if (!resp.ok) {
      throw new Error(json?.erro?.mensagem ?? "Não foi possível registrar o atendimento.");
    }

    return json;
  }

  function abrirLancamento(a: AgendamentoPendente) {
    setAgendamentoSelecionado(a);
    setValorAgendamento(a.servicos?.preco ? String(a.servicos.preco) : "");
    setErro(null);
    setSucesso(null);
  }

  async function confirmarLancamentoAgendamento(e: React.FormEvent) {
    e.preventDefault();
    if (!agendamentoSelecionado) return;

    setLancandoAgendamento(true);
    setErro(null);
    try {
      await registrarAtendimento({
        cliente_id: agendamentoSelecionado.cliente_id,
        profissional_id: agendamentoSelecionado.profissional_id,
        servico_id: agendamentoSelecionado.servico_id,
        valor_cobrado: Number(valorAgendamento),
        agendamento_id: agendamentoSelecionado.id,
      });
      setSucesso("Atendimento registrado e agendamento concluído.");
      setAgendamentoSelecionado(null);
      carregarTudo();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLancandoAgendamento(false);
    }
  }

  async function handleLancamentoAvulso(e: React.FormEvent) {
    e.preventDefault();

    if (!clienteAvulsoId || !profissionalAvulsoId || !servicoAvulsoId || !valorAvulso) {
      setErro("Preencha cliente, profissional, serviço e valor.");
      return;
    }

    setLancandoAvulso(true);
    setErro(null);
    try {
      await registrarAtendimento({
        cliente_id: clienteAvulsoId,
        profissional_id: profissionalAvulsoId,
        servico_id: servicoAvulsoId,
        valor_cobrado: Number(valorAvulso),
      });
      setSucesso("Atendimento avulso registrado no caixa.");
      setClienteAvulsoId("");
      setProfissionalAvulsoId("");
      setServicoAvulsoId("");
      setValorAvulso("");
      carregarTudo();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLancandoAvulso(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Caixa</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Registrar um atendimento calcula automaticamente o split de comissão.
      </p>

      {erro && <p className="alert-error">{erro}</p>}
      {sucesso && (
        <p style={{ color: "var(--success)", fontSize: 13, marginTop: 8 }}>{sucesso}</p>
      )}

      <h2 className="section-title">Agendamentos de hoje pendentes</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : pendentes.length === 0 ? (
        <p className="empty-state">Nenhum agendamento pendente para hoje.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Cliente</th>
              <th>Profissional</th>
              <th>Serviço</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pendentes.map((a) => (
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
                  <button className="btn btn-primary" onClick={() => abrirLancamento(a)}>
                    Lançar no caixa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {agendamentoSelecionado && (
        <form onSubmit={confirmarLancamentoAgendamento} className="form-row" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13, alignSelf: "center" }}>
            Confirmando {agendamentoSelecionado.clientes?.nome} — {agendamentoSelecionado.servicos?.nome}
          </span>
          <label className="field">
            Valor cobrado (R$)
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={valorAgendamento}
              onChange={(e) => setValorAgendamento(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={lancandoAgendamento} className="btn btn-primary">
            {lancandoAgendamento ? "Registrando..." : "Confirmar"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setAgendamentoSelecionado(null)}
          >
            Cancelar
          </button>
        </form>
      )}

      <h2 className="section-title">Atendimento avulso (sem agendamento)</h2>
      <form onSubmit={handleLancamentoAvulso} className="form-row">
        <label className="field">
          Cliente
          <select value={clienteAvulsoId} onChange={(e) => setClienteAvulsoId(e.target.value)}>
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
          <select
            value={profissionalAvulsoId}
            onChange={(e) => setProfissionalAvulsoId(e.target.value)}
          >
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
          <select
            value={servicoAvulsoId}
            onChange={(e) => {
              setServicoAvulsoId(e.target.value);
              const s = servicos.find((sv) => sv.id === e.target.value);
              if (s) setValorAvulso(String(s.preco));
            }}
          >
            <option value="">Selecione</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Valor cobrado (R$)
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={valorAvulso}
            onChange={(e) => setValorAvulso(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={lancandoAvulso} className="btn btn-primary">
          {lancandoAvulso ? "Registrando..." : "Registrar"}
        </button>
      </form>

      <h2 className="section-title">Últimos atendimentos</h2>
      {recentes.length === 0 ? (
        <p className="empty-state">Nenhum atendimento registrado ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Profissional</th>
              <th>Serviço</th>
              <th>Valor</th>
              <th>Comissão</th>
              <th>Estúdio</th>
            </tr>
          </thead>
          <tbody>
            {recentes.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.data_atendimento).toLocaleDateString("pt-BR")}</td>
                <td>{a.clientes?.nome ?? "-"}</td>
                <td>{a.profissionais?.nome ?? "-"}</td>
                <td>{a.servicos?.nome ?? "-"}</td>
                <td>{formatarMoeda(a.valor_cobrado)}</td>
                <td>{formatarMoeda(a.valor_comissao)}</td>
                <td>{formatarMoeda(a.valor_estudio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
