"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Cliente {
  id: string;
  nome: string;
}
interface Profissional {
  id: string;
  nome: string;
}
interface ItemCatalogo {
  id: string;
  nome: string;
  preco: number;
  tipo: string;
}
interface FormaPagamento {
  id: string;
  nome: string;
  ativa: boolean;
}
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
interface ItemCarrinho {
  chave: string;
  servico_id: string;
  profissional_id: string;
  quantidade: number;
  valor_unitario: number;
  agendamento_id?: string;
  rotulo?: string;
}
interface Sessao {
  id: string;
  numero: number;
  status: string;
  valor_abertura: number;
  data_abertura: string;
  data_fechamento: string | null;
}
interface ResumoSessao {
  valor_abertura: number;
  total_vendas: number;
  total_vendas_caixa_fisico: number;
  quantidade_vendas: number;
  total_suprimento: number;
  total_sangria: number;
  total_despesa: number;
  total_despesa_caixa_fisico: number;
  valor_esperado_caixa_fisico: number;
}
interface VendaRecente {
  id: string;
  numero: number;
  cliente_nome: string;
  forma_pagamento: string;
  subtotal: number;
  desconto: number;
  total: number;
  data_venda: string;
  itens: { servico_nome: string; profissional_nome: string; quantidade: number; valor_cobrado: number }[];
}
interface MovimentoCaixa {
  id: string;
  tipo: string;
  valor: number;
  descricao: string | null;
  data_movimento: string;
}

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

let contadorChave = 0;
function novaChave() {
  contadorChave += 1;
  return `item-${contadorChave}`;
}

const compactFieldStyle: React.CSSProperties = {
  background: "var(--bg-elevated-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const rotuloMovimento: Record<string, string> = {
  suprimento: "Suprimento (dinheiro entrando no caixa)",
  sangria: "Sangria (dinheiro saindo do caixa)",
  despesa: "Despesa paga com o caixa",
};

// Caixa como PDV (reescrito em 31/07/2026 a pedido do usuário, inspirado num
// PDV de outro sistema). Fluxo: abrir o caixa (sessão do dia) -> montar uma
// venda (cliente + carrinho de produtos/serviços, cada item com seu
// profissional e quantidade, desconto opcional, forma de pagamento) ->
// confirmar o pagamento fecha a venda -> no fim do dia, fechar o caixa
// informando o valor contado, o sistema calcula o valor esperado.
//
// Regra importante (pedido explícito do usuário): o "Total" mostrado aqui é
// SEMPRE o valor bruto cobrado do cliente — nunca líquido de comissão. A
// comissão de cada profissional é calculada no servidor (POST
// /api/caixa/vendas) e fica só nos relatórios/Dashboard, nunca nesta tela.
export default function CaixaPage() {
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [itensCatalogo, setItensCatalogo] = useState<ItemCatalogo[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [pendentes, setPendentes] = useState<AgendamentoPendente[]>([]);

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [resumo, setResumo] = useState<ResumoSessao | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [vendasRecentes, setVendasRecentes] = useState<VendaRecente[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [valorAberturaInput, setValorAberturaInput] = useState("0");
  const [abrindoCaixa, setAbrindoCaixa] = useState(false);

  const [mostrarFechar, setMostrarFechar] = useState(false);
  const [valorFechamentoInput, setValorFechamentoInput] = useState("");
  const [fechandoCaixa, setFechandoCaixa] = useState(false);

  const [tipoMovimento, setTipoMovimento] = useState<"suprimento" | "sangria" | "despesa" | null>(null);
  const [valorMovimento, setValorMovimento] = useState("");
  const [descricaoMovimento, setDescricaoMovimento] = useState("");
  const [lancandoMovimento, setLancandoMovimento] = useState(false);

  const [mostrarResumo, setMostrarResumo] = useState(false);

  const [clienteVendaId, setClienteVendaId] = useState("");
  const [itensVenda, setItensVenda] = useState<ItemCarrinho[]>([]);
  const [descontoVenda, setDescontoVenda] = useState("0");
  const [formaPagamentoVendaId, setFormaPagamentoVendaId] = useState("");
  const [confirmandoVenda, setConfirmandoVenda] = useState(false);

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
  }

  async function carregarTudo() {
    setCarregando(true);
    setErro(null);

    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);
    const hojeFim = new Date();
    hojeFim.setHours(23, 59, 59, 999);

    const headers = await authHeaders();

    const [
      { data: c },
      { data: p },
      { data: s },
      { data: fp },
      { data: pend },
      sessaoResp,
      vendasResp,
      movResp,
    ] = await Promise.all([
      supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("servicos").select("id, nome, preco, tipo").order("nome"),
      supabase.from("formas_pagamento").select("id, nome, ativa").eq("ativa", true).order("nome"),
      supabase
        .from("agendamentos")
        .select(
          "id, data_hora_inicio, cliente_id, profissional_id, servico_id, clientes(nome), profissionais(nome), servicos(nome, preco)"
        )
        .eq("status", "agendado")
        .gte("data_hora_inicio", hojeInicio.toISOString())
        .lte("data_hora_inicio", hojeFim.toISOString())
        .order("data_hora_inicio"),
      fetch("/api/caixa/sessoes", { headers }).then((r) => r.json()),
      fetch("/api/caixa/vendas?limit=15", { headers }).then((r) => r.json()),
      fetch("/api/caixa/movimentos", { headers }).then((r) => r.json()),
    ]);

    setClientes((c as Cliente[]) ?? []);
    setProfissionais((p as Profissional[]) ?? []);
    setItensCatalogo((s as ItemCatalogo[]) ?? []);
    setFormasPagamento((fp as FormaPagamento[]) ?? []);
    setPendentes((pend as unknown as AgendamentoPendente[]) ?? []);
    setSessao(sessaoResp?.sessao ?? null);
    setResumo(sessaoResp?.resumo ?? null);
    setVendasRecentes(vendasResp?.vendas ?? []);
    setMovimentos(movResp?.movimentos ?? []);

    setFormaPagamentoVendaId((atual) => {
      if (atual) return atual;
      const ativas = (fp as FormaPagamento[]) ?? [];
      return ativas.length > 0 ? ativas[0].id : "";
    });

    setCarregando(false);
  }

  async function abrirCaixa(e: React.FormEvent) {
    e.preventDefault();
    setAbrindoCaixa(true);
    setErro(null);
    setSucesso(null);
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/caixa/sessoes", {
        method: "POST",
        headers,
        body: JSON.stringify({ valor_abertura: Number(valorAberturaInput || 0) }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.erro?.mensagem ?? "Não foi possível abrir o caixa.");
      setSucesso(`Caixa ${json.sessao.numero} aberto.`);
      setValorAberturaInput("0");
      await carregarTudo();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setAbrindoCaixa(false);
    }
  }

  async function fecharCaixa(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setFechandoCaixa(true);
    setErro(null);
    setSucesso(null);
    try {
      const headers = await authHeaders();
      const resp = await fetch(`/api/caixa/sessoes/${sessao.id}/fechar`, {
        method: "POST",
        headers,
        body: JSON.stringify({ valor_fechamento_informado: Number(valorFechamentoInput || 0) }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.erro?.mensagem ?? "Não foi possível fechar o caixa.");
      setSucesso(`Caixa ${json.sessao.numero} fechado. Diferença: ${formatarMoeda(json.sessao.diferenca)}.`);
      setMostrarFechar(false);
      setValorFechamentoInput("");
      await carregarTudo();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setFechandoCaixa(false);
    }
  }

  async function lancarMovimento(e: React.FormEvent) {
    e.preventDefault();
    if (!tipoMovimento) return;
    setLancandoMovimento(true);
    setErro(null);
    setSucesso(null);
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/caixa/movimentos", {
        method: "POST",
        headers,
        body: JSON.stringify({
          tipo: tipoMovimento,
          valor: Number(valorMovimento || 0),
          descricao: descricaoMovimento || undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.erro?.mensagem ?? "Não foi possível registrar o movimento.");
      setSucesso("Movimento registrado.");
      setTipoMovimento(null);
      setValorMovimento("");
      setDescricaoMovimento("");
      await carregarTudo();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setLancandoMovimento(false);
    }
  }

  function adicionarItemVazio() {
    setItensVenda((prev) => [
      ...prev,
      { chave: novaChave(), servico_id: "", profissional_id: "", quantidade: 1, valor_unitario: 0 },
    ]);
  }

  function adicionarItemDeAgendamento(a: AgendamentoPendente) {
    setErro(null);
    setClienteVendaId(a.cliente_id);
    setItensVenda((prev) => [
      ...prev,
      {
        chave: novaChave(),
        servico_id: a.servico_id,
        profissional_id: a.profissional_id,
        quantidade: 1,
        valor_unitario: a.servicos?.preco ?? 0,
        agendamento_id: a.id,
        rotulo: `Agendamento das ${new Date(a.data_hora_inicio).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      },
    ]);
  }

  function removerItem(chave: string) {
    setItensVenda((prev) => prev.filter((i) => i.chave !== chave));
  }

  function atualizarItem(chave: string, patch: Partial<ItemCarrinho>) {
    setItensVenda((prev) => prev.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  }

  const subtotalVenda = itensVenda.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0);
  const descontoNum = Number(descontoVenda || 0);
  const totalVenda = Math.max(subtotalVenda - descontoNum, 0);

  async function confirmarVenda(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!sessao) {
      setErro("Abra o caixa antes de lançar uma venda.");
      return;
    }
    if (!clienteVendaId) {
      setErro("Selecione o cliente.");
      return;
    }
    if (itensVenda.length === 0) {
      setErro("Adicione pelo menos 1 item à venda.");
      return;
    }
    if (itensVenda.some((i) => !i.servico_id || !i.profissional_id || i.quantidade <= 0 || i.valor_unitario <= 0)) {
      setErro("Preencha produto/serviço, profissional, quantidade e valor de todos os itens.");
      return;
    }
    if (!formaPagamentoVendaId) {
      setErro("Selecione a forma de pagamento.");
      return;
    }
    if (descontoNum > subtotalVenda) {
      setErro("O desconto não pode ser maior que o subtotal.");
      return;
    }

    setConfirmandoVenda(true);
    try {
      const headers = await authHeaders();
      const resp = await fetch("/api/caixa/vendas", {
        method: "POST",
        headers,
        body: JSON.stringify({
          cliente_id: clienteVendaId,
          forma_pagamento_id: formaPagamentoVendaId,
          desconto: descontoNum,
          itens: itensVenda.map((i) => ({
            servico_id: i.servico_id,
            profissional_id: i.profissional_id,
            quantidade: i.quantidade,
            valor_unitario: i.valor_unitario,
            agendamento_id: i.agendamento_id,
          })),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.erro?.mensagem ?? "Não foi possível registrar a venda.");
      setSucesso(`Venda #${json.numero} registrada — ${formatarMoeda(json.total)}.`);
      setClienteVendaId("");
      setItensVenda([]);
      setDescontoVenda("0");
      await carregarTudo();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setConfirmandoVenda(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Caixa</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Abra o caixa, monte a venda e confirme o pagamento. O valor mostrado aqui é sempre o bruto — a comissão de
        cada profissional é calculada à parte, nos relatórios.
      </p>

      {erro && <p className="alert-error" style={{ marginTop: 16 }}>{erro}</p>}
      {sucesso && <p style={{ color: "var(--success)", fontSize: 13, marginTop: 16 }}>{sucesso}</p>}

      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", marginTop: 20 }}>
          {/* -------- Card: Venda -------- */}
          <div className="card" style={{ flex: "2 1 480px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 className="card-title" style={{ marginBottom: 4 }}>
                Nova Venda
              </h2>
              <span style={{ fontSize: 24, fontWeight: 700 }}>{formatarMoeda(totalVenda)}</span>
            </div>
            <p className="card-subtitle">Cliente, itens do carrinho, desconto e forma de pagamento.</p>

            {!sessao && (
              <p className="alert-error">O caixa está fechado. Abra o caixa ao lado para lançar uma venda.</p>
            )}

            <label className="field">
              Cliente
              <select value={clienteVendaId} onChange={(e) => setClienteVendaId(e.target.value)} disabled={!sessao}>
                <option value="">Selecione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>

            <table className="data-table" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>Produto/Serviço</th>
                  <th>Profissional</th>
                  <th style={{ width: 64 }}>Qtd</th>
                  <th style={{ width: 110 }}>Valor unit.</th>
                  <th style={{ width: 100 }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itensVenda.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      Nenhum item adicionado.
                    </td>
                  </tr>
                ) : (
                  itensVenda.map((item) => (
                    <tr key={item.chave}>
                      <td>
                        <select
                          style={compactFieldStyle}
                          value={item.servico_id}
                          onChange={(e) => {
                            const s = itensCatalogo.find((x) => x.id === e.target.value);
                            atualizarItem(item.chave, {
                              servico_id: e.target.value,
                              valor_unitario: s ? Number(s.preco) : item.valor_unitario,
                            });
                          }}
                        >
                          <option value="">Selecione</option>
                          {itensCatalogo.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome}
                              {s.tipo === "produto" ? " (produto)" : ""}
                            </option>
                          ))}
                        </select>
                        {item.rotulo && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{item.rotulo}</div>
                        )}
                      </td>
                      <td>
                        <select
                          style={compactFieldStyle}
                          value={item.profissional_id}
                          onChange={(e) => atualizarItem(item.chave, { profissional_id: e.target.value })}
                        >
                          <option value="">Selecione</option>
                          {profissionais.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          style={compactFieldStyle}
                          value={item.quantidade}
                          onChange={(e) => atualizarItem(item.chave, { quantidade: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          style={compactFieldStyle}
                          value={item.valor_unitario}
                          onChange={(e) => atualizarItem(item.chave, { valor_unitario: Number(e.target.value) })}
                        />
                      </td>
                      <td>{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "4px 10px", color: "var(--danger)" }}
                          onClick={() => removerItem(item.chave)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <button
              type="button"
              className="btn"
              onClick={adicionarItemVazio}
              disabled={!sessao}
              style={{ marginBottom: 20 }}
            >
              + Adicionar item
            </button>

            <form onSubmit={confirmarVenda}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label className="field" style={{ minWidth: 140 }}>
                  Desconto (R$)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={descontoVenda}
                    onChange={(e) => setDescontoVenda(e.target.value)}
                  />
                </label>
                <label className="field" style={{ minWidth: 220, flex: 1 }}>
                  Forma de pagamento
                  <select value={formaPagamentoVendaId} onChange={(e) => setFormaPagamentoVendaId(e.target.value)}>
                    <option value="">Selecione</option>
                    {formasPagamento.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "var(--text-muted)",
                  margin: "4px 0 16px",
                }}
              >
                <span>Subtotal: {formatarMoeda(subtotalVenda)}</span>
                <span>Desconto: -{formatarMoeda(descontoNum)}</span>
                <strong style={{ color: "var(--text)" }}>Total: {formatarMoeda(totalVenda)}</strong>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={!sessao || confirmandoVenda}>
                {confirmandoVenda ? "Registrando..." : "Confirmar Pagamento"}
              </button>
            </form>
          </div>

          {/* -------- Coluna: Sessão de Caixa -------- */}
          <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 24 }}>
            {!sessao ? (
              <div className="card">
                <h2 className="card-title">Caixa fechado</h2>
                <p className="card-subtitle">Abra o caixa para começar a lançar vendas.</p>
                <form onSubmit={abrirCaixa}>
                  <label className="field">
                    Valor de abertura (fundo de troco)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={valorAberturaInput}
                      onChange={(e) => setValorAberturaInput(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="btn btn-primary btn-block" disabled={abrindoCaixa}>
                    {abrindoCaixa ? "Abrindo..." : "Abrir Caixa"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="card">
                <h2 className="card-title">Caixa {sessao.numero}</h2>
                <p className="card-subtitle">
                  Aberto em {new Date(sessao.data_abertura).toLocaleString("pt-BR")}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                  <button type="button" className="btn" onClick={() => setMostrarResumo((v) => !v)}>
                    {mostrarResumo ? "Ocultar resumo" : "Resumo"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ color: "var(--danger)" }}
                    onClick={() => setMostrarFechar((v) => !v)}
                  >
                    Fechar Caixa
                  </button>
                  <button type="button" className="btn" onClick={() => setTipoMovimento("suprimento")}>
                    Suprimento
                  </button>
                  <button type="button" className="btn" onClick={() => setTipoMovimento("sangria")}>
                    Sangria
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ gridColumn: "1 / -1" }}
                    onClick={() => setTipoMovimento("despesa")}
                  >
                    Despesa
                  </button>
                </div>

                {mostrarResumo && resumo && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, fontSize: 13 }}>
                    <ResumoLinha label="Abertura" valor={resumo.valor_abertura} />
                    <ResumoLinha label={`Vendas (${resumo.quantidade_vendas})`} valor={resumo.total_vendas} />
                    <ResumoLinha label="Suprimento" valor={resumo.total_suprimento} />
                    <ResumoLinha label="Sangria" valor={-resumo.total_sangria} />
                    <ResumoLinha label="Despesa" valor={-resumo.total_despesa} />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        borderTop: "1px solid var(--border)",
                        paddingTop: 8,
                        fontWeight: 700,
                      }}
                    >
                      <span>Esperado em caixa</span>
                      <span>{formatarMoeda(resumo.valor_esperado_caixa_fisico)}</span>
                    </div>
                  </div>
                )}

                {tipoMovimento && (
                  <form
                    onSubmit={lancarMovimento}
                    style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}
                  >
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
                      {rotuloMovimento[tipoMovimento]}
                    </p>
                    <label className="field">
                      Valor (R$)
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={valorMovimento}
                        onChange={(e) => setValorMovimento(e.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      Descrição
                      <input
                        type="text"
                        value={descricaoMovimento}
                        onChange={(e) => setDescricaoMovimento(e.target.value)}
                        placeholder="Opcional"
                      />
                    </label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button type="submit" className="btn btn-primary" disabled={lancandoMovimento}>
                        {lancandoMovimento ? "Registrando..." : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setTipoMovimento(null);
                          setValorMovimento("");
                          setDescricaoMovimento("");
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}

                {mostrarFechar && (
                  <form
                    onSubmit={fecharCaixa}
                    style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}
                  >
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
                      Valor esperado em caixa:{" "}
                      <strong>{resumo ? formatarMoeda(resumo.valor_esperado_caixa_fisico) : "-"}</strong>
                    </p>
                    <label className="field">
                      Valor contado na gaveta (R$)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={valorFechamentoInput}
                        onChange={(e) => setValorFechamentoInput(e.target.value)}
                        required
                      />
                    </label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button type="submit" className="btn btn-primary" disabled={fechandoCaixa}>
                        {fechandoCaixa ? "Fechando..." : "Confirmar Fechamento"}
                      </button>
                      <button type="button" className="btn" onClick={() => setMostrarFechar(false)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {sessao && movimentos.length > 0 && (
              <div className="card">
                <h2 className="card-title" style={{ fontSize: 16 }}>
                  Movimentos de hoje
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {movimentos.map((m) => (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        {m.tipo === "suprimento" ? "Suprimento" : m.tipo === "sangria" ? "Sangria" : "Despesa"}
                        {m.descricao ? ` — ${m.descricao}` : ""}
                      </span>
                      <span>{formatarMoeda(m.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
                  {new Date(a.data_hora_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td>{a.clientes?.nome ?? "-"}</td>
                <td>{a.profissionais?.nome ?? "-"}</td>
                <td>{a.servicos?.nome ?? "-"}</td>
                <td>
                  <button
                    className="btn btn-primary"
                    disabled={!sessao}
                    onClick={() => adicionarItemDeAgendamento(a)}
                  >
                    Adicionar à venda
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Últimas vendas do caixa aberto</h2>
      {vendasRecentes.length === 0 ? (
        <p className="empty-state">Nenhuma venda registrada neste caixa ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Itens</th>
              <th>Forma de pagamento</th>
              <th>Desconto</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {vendasRecentes.map((v) => (
              <tr key={v.id}>
                <td>{v.numero}</td>
                <td>{new Date(v.data_venda).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>{v.cliente_nome}</td>
                <td>{v.itens.map((i) => `${i.quantidade}× ${i.servico_nome}`).join(", ")}</td>
                <td>{v.forma_pagamento}</td>
                <td>{v.desconto > 0 ? formatarMoeda(v.desconto) : "-"}</td>
                <td>{formatarMoeda(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ResumoLinha({ label, valor }: { label: string; valor: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span>{formatarMoeda(valor)}</span>
    </div>
  );
}
