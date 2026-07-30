"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface ContaBancaria {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  tipo: string;
  saldo_inicial: number;
  saldo_atual: number;
  ativa: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  carteira_digital: "Carteira Digital",
  outra: "Outra",
};

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Cadastro de Contas Bancárias (módulo Financeiro), adicionado em
// 30/07/2026 a pedido do usuário: controlar o saldo das contas de banco,
// separado de Contas a Pagar/Receber (o que ainda vai sair/entrar) e do
// Caixa (caixa físico do dia a dia, Fase 2). Nesta primeira versão o
// saldo_atual é atualizado manualmente aqui — dá pra bater com o extrato
// do banco sempre que quiser. Conciliação automática a partir dos
// lançamentos fica para uma fase futura.
export default function ContasBancariasPage() {
  const supabase = createClient();

  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [numeroConta, setNumeroConta] = useState("");
  const [tipo, setTipo] = useState("corrente");
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [salvando, setSalvando] = useState(false);

  const [editandoSaldoId, setEditandoSaldoId] = useState<string | null>(null);
  const [novoSaldo, setNovoSaldo] = useState("");

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("contas_bancarias")
      .select("id, nome, banco, agencia, numero_conta, tipo, saldo_inicial, saldo_atual, ativa")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar as contas bancárias.");
    } else {
      setContas((data as ContaBancaria[]) ?? []);
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

    const valorInicial = Number(saldoInicial.replace(",", "."));
    if (Number.isNaN(valorInicial)) {
      setErro("Saldo inicial inválido.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("contas_bancarias").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
        banco: banco.trim() || null,
        agencia: agencia.trim() || null,
        numero_conta: numeroConta.trim() || null,
        tipo,
        saldo_inicial: valorInicial,
        saldo_atual: valorInicial,
      });

      if (error) {
        setErro("Não foi possível salvar: " + error.message);
        return;
      }

      setErro(null);
      setNome("");
      setBanco("");
      setAgencia("");
      setNumeroConta("");
      setTipo("corrente");
      setSaldoInicial("0");
      carregar();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtiva(c: ContaBancaria) {
    const { error } = await supabase
      .from("contas_bancarias")
      .update({ ativa: !c.ativa })
      .eq("id", c.id);

    if (error) {
      setErro("Não foi possível atualizar: " + error.message);
      return;
    }
    carregar();
  }

  function iniciarEdicaoSaldo(c: ContaBancaria) {
    setEditandoSaldoId(c.id);
    setNovoSaldo(String(c.saldo_atual));
  }

  async function salvarSaldo(c: ContaBancaria) {
    const valor = Number(novoSaldo.replace(",", "."));
    if (Number.isNaN(valor)) {
      setErro("Saldo inválido.");
      return;
    }

    const { error } = await supabase
      .from("contas_bancarias")
      .update({ saldo_atual: valor, updated_at: new Date().toISOString() })
      .eq("id", c.id);

    if (error) {
      setErro("Não foi possível atualizar o saldo: " + error.message);
      return;
    }

    setEditandoSaldoId(null);
    carregar();
  }

  const saldoTotal = contas
    .filter((c) => c.ativa)
    .reduce((soma, c) => soma + Number(c.saldo_atual), 0);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Contas Bancárias</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Cadastro das contas de banco do estúdio e controle do saldo de cada uma.
      </p>

      {erro && (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      )}

      <div className="stat-grid" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Saldo total (contas ativas)</div>
          <div className="stat-value">{formatarMoeda(saldoTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Contas cadastradas</div>
          <div className="stat-value">{contas.length}</div>
        </div>
      </div>

      <h2 className="section-title">Nova conta bancária</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Banco do Brasil - CC"
            required
          />
        </label>
        <label className="field">
          Banco
          <input
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            placeholder="Ex.: Banco do Brasil"
          />
        </label>
        <label className="field">
          Agência
          <input value={agencia} onChange={(e) => setAgencia(e.target.value)} placeholder="0000" />
        </label>
        <label className="field">
          Conta
          <input
            value={numeroConta}
            onChange={(e) => setNumeroConta(e.target.value)}
            placeholder="00000-0"
          />
        </label>
        <label className="field">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Saldo inicial
          <input
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
          />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 className="section-title">Todas as contas</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : contas.length === 0 ? (
        <p className="empty-state">Nenhuma conta bancária cadastrada ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Banco</th>
              <th>Tipo</th>
              <th>Saldo atual</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.banco ?? "—"}</td>
                <td>{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                <td>
                  {editandoSaldoId === c.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={novoSaldo}
                        onChange={(e) => setNovoSaldo(e.target.value)}
                        style={{ width: 100 }}
                        inputMode="decimal"
                        autoFocus
                      />
                      <button className="btn btn-primary" onClick={() => salvarSaldo(c)}>
                        Salvar
                      </button>
                      <button className="btn btn-ghost" onClick={() => setEditandoSaldoId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    formatarMoeda(Number(c.saldo_atual))
                  )}
                </td>
                <td>
                  <span className={c.ativa ? "badge badge-accent" : "badge"}>
                    {c.ativa ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  {editandoSaldoId !== c.id && (
                    <button className="btn btn-ghost" onClick={() => iniciarEdicaoSaldo(c)}>
                      Atualizar saldo
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => alternarAtiva(c)}>
                    {c.ativa ? "Desativar" : "Reativar"}
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
