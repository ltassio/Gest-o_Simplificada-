"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
}

export default function ClientesPage() {
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarClientes() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, telefone, email")
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
    const { error } = await supabase.from("clientes").insert({
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      email: email.trim() || null,
    });
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar o cliente: " + error.message);
      return;
    }

    setErro(null);
    setNome("");
    setTelefone("");
    setEmail("");
    carregarClientes();
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Clientes</h1>

      {erro && <p className="alert-error">{erro}</p>}

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
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.telefone ?? "-"}</td>
                <td>{c.email ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
