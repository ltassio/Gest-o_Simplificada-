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
      <h1>Clientes</h1>

      {erro && <p style={{ color: "#c0392b" }}>{erro}</p>}

      <h2 style={{ marginTop: 24 }}>Novo cliente</h2>
      <form
        onSubmit={handleCriar}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
          Telefone
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 style={{ marginTop: 24 }}>Todos os clientes</h2>
      {carregando ? (
        <p>Carregando...</p>
      ) : clientes.length === 0 ? (
        <p>Nenhum cliente cadastrado ainda.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Telefone</th>
              <th style={th}>E-mail</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td style={td}>{c.nome}</td>
                <td style={td}>{c.telefone ?? "-"}</td>
                <td style={td}>{c.email ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 };
const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: 8 };
