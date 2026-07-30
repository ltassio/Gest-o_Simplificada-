"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTenantId } from "@/lib/tenant";

interface Fornecedor {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
}

export default function FornecedoresPage() {
  const supabase = createClient();

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarFornecedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarFornecedores() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("fornecedores")
      .select("id, nome, telefone, email, cnpj")
      .order("nome");

    if (error) {
      setErro("Não foi possível carregar os fornecedores.");
    } else {
      setFornecedores((data as Fornecedor[]) ?? []);
      setErro(null);
    }
    setCarregando(false);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("Informe o nome do fornecedor.");
      return;
    }

    setSalvando(true);
    try {
      const tenantId = await getTenantId(supabase);
      const { error } = await supabase.from("fornecedores").insert({
        tenant_id: tenantId,
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        cnpj: cnpj.trim() || null,
      });

      if (error) {
        setErro("Não foi possível salvar o fornecedor: " + error.message);
        return;
      }

      setErro(null);
      setNome("");
      setTelefone("");
      setEmail("");
      setCnpj("");
      carregarFornecedores();
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Fornecedores</h1>

      {erro && <p className="alert-error">{erro}</p>}

      <h2 className="section-title">Novo fornecedor</h2>
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
        <label className="field">
          CNPJ
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </label>
        <button type="submit" disabled={salvando} className="btn btn-primary">
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      <h2 className="section-title">Todos os fornecedores</h2>
      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : fornecedores.length === 0 ? (
        <p className="empty-state">Nenhum fornecedor cadastrado ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>CNPJ</th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td>{f.telefone ?? "-"}</td>
                <td>{f.email ?? "-"}</td>
                <td>{f.cnpj ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
