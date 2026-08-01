"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface Profissional {
  id: string;
  nome: string;
  percentual_comissao: number;
  carga_horaria_semanal: number;
  ativo: boolean;
}

// Cadastro de Profissionais (Documento de Visão do Produto v2.0, Seção 6).
// O percentual de comissão aqui definido é o valor "vigente": ao registrar
// um atendimento no Caixa, a API Route copia (snapshot) esse valor para o
// atendimento, então mudar aqui não altera o histórico já lançado —
// decisão registrada no Documento de Modelagem de Banco de Dados, Seção 5.
//
// "Carga horária semanal" (migration 008, 01/08/2026): capacidade de
// trabalho do profissional, usada como base do indicador "Agenda Ocupada"
// do Dashboard (ocupado / capacidade). A pedido do usuário, é cadastrada
// aqui por profissional — não reaproveita "Horas produtivas/mês" da
// Precificação, que é um número único por tenant pensado para calcular
// preço de serviço, não para medir ociosidade real da agenda.
export default function ProfissionaisPage() {
  const supabase = createClient();

  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [percentual, setPercentual] = useState("40");
  const [cargaHoraria, setCargaHoraria] = useState("40");
  const [salvando, setSalvando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edPercentual, setEdPercentual] = useState("");
  const [edCargaHoraria, setEdCargaHoraria] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  useEffect(() => {
    carregarProfissionais();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarProfissionais() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("profissionais")
      .select("id, nome, percentual_comissao, carga_horaria_semanal, ativo")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar os profissionais.");
    } else {
      setProfissionais((data as Profissional[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("Informe o nome do profissional.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("profissionais").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
        percentual_comissao: Number(percentual),
        carga_horaria_semanal: Number(cargaHoraria),
      });

      if (error) {
        setErro("Não foi possível salvar o profissional: " + error.message);
        return;
      }

      setErro(null);
      setNome("");
      setPercentual("40");
      setCargaHoraria("40");
      carregarProfissionais();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p: Profissional) {
    const { error } = await supabase
      .from("profissionais")
      .update({ ativo: !p.ativo })
      .eq("id", p.id);

    if (error) {
      setErro("Não foi possível atualizar o profissional: " + error.message);
      return;
    }
    carregarProfissionais();
  }

  function iniciarEdicao(p: Profissional) {
    setErro(null);
    setEditandoId(p.id);
    setEdPercentual(String(p.percentual_comissao ?? 0));
    setEdCargaHoraria(String(p.carga_horaria_semanal ?? 40));
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao(id: string) {
    setSalvandoEdicao(true);
    try {
      const { error } = await supabase
        .from("profissionais")
        .update({
          percentual_comissao: Number(edPercentual),
          carga_horaria_semanal: Number(edCargaHoraria),
        })
        .eq("id", id);

      if (error) {
        setErro("Não foi possível salvar as alterações: " + error.message);
        return;
      }

      setErro(null);
      setEditandoId(null);
      carregarProfissionais();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Profissionais</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        O percentual de comissão é usado no split automático do Caixa e na calculadora de
        Precificação. A carga horária semanal define a capacidade usada no indicador
        &quot;Agenda Ocupada&quot; do Dashboard.
      </p>

      {erro && <p className="alert-error">{erro}</p>}

      <h2 className="section-title">Novo profissional</h2>
      <form onSubmit={handleCriar} className="form-row">
        <label className="field">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label className="field">
          Comissão (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
          />
        </label>
        <label className="field">
          Carga horária semanal (h)
          <input
            type="number"
            min={0}
            max={168}
            step="0.5"
            value={cargaHoraria}
            onChange={(e) => setCargaHoraria(e.target.value)}
          />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 className="section-title">Todos os profissionais</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : profissionais.length === 0 ? (
        <p className="empty-state">Nenhum profissional cadastrado ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Comissão</th>
              <th>Carga horária/semana</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {profissionais.map((p) =>
              editandoId === p.id ? (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={edPercentual}
                      onChange={(e) => setEdPercentual(e.target.value)}
                      style={{ width: 80 }}
                    />
                    %
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={168}
                      step="0.5"
                      value={edCargaHoraria}
                      onChange={(e) => setEdCargaHoraria(e.target.value)}
                      style={{ width: 80 }}
                    />
                    h
                  </td>
                  <td>
                    <span className={p.ativo ? "badge badge-accent" : "badge"}>
                      {p.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-primary"
                        disabled={salvandoEdicao}
                        onClick={() => salvarEdicao(p.id)}
                      >
                        {salvandoEdicao ? "Salvando..." : "Salvar"}
                      </button>
                      <button className="btn" onClick={cancelarEdicao}>
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>{Number(p.percentual_comissao)}%</td>
                  <td>{Number(p.carga_horaria_semanal ?? 40)}h</td>
                  <td>
                    <span className={p.ativo ? "badge badge-accent" : "badge"}>
                      {p.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn" onClick={() => iniciarEdicao(p)}>
                        Editar
                      </button>
                      <button className="btn" onClick={() => alternarAtivo(p)}>
                        {p.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </div>
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
