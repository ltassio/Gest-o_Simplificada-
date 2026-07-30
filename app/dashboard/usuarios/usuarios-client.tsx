"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAPEL_LABEL, PAPEL_DESCRICAO, type Papel } from "@/lib/permissoes";

export interface UsuarioLinha {
  id: string;
  nome: string | null;
  email: string | null;
  papel: string;
  souEu: boolean;
}

const PAPEIS: Papel[] = ["dono", "financeiro", "operador"];

export default function UsuariosClient({
  usuariosIniciais,
}: {
  usuariosIniciais: UsuarioLinha[];
}) {
  const supabase = createClient();

  const [usuarios, setUsuarios] = useState<UsuarioLinha[]>(usuariosIniciais);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("operador");
  const [convidando, setConvidando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);

  async function handleConvidar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSenhaGerada(null);

    if (!nome.trim() || !email.trim()) {
      setErro("Preencha nome e e-mail.");
      return;
    }

    setConvidando(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const resp = await fetch("/api/usuarios/convidar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ nome: nome.trim(), email: email.trim(), papel }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        setErro(json?.erro?.mensagem ?? "Não foi possível criar o usuário.");
        return;
      }

      setUsuarios((atual) => [
        ...atual,
        { id: json.usuario.id, nome: json.usuario.nome, email: json.usuario.email, papel: json.usuario.papel, souEu: false },
      ]);
      setSenhaGerada({ email: json.usuario.email, senha: json.senha_temporaria });
      setNome("");
      setEmail("");
      setPapel("operador");
    } catch (e: any) {
      setErro(e.message ?? "Erro inesperado.");
    } finally {
      setConvidando(false);
    }
  }

  async function handleMudarPapel(id: string, novoPapel: string) {
    setErro(null);
    const { error } = await supabase.from("perfis").update({ papel: novoPapel }).eq("id", id);
    if (error) {
      setErro("Não foi possível mudar o papel: " + error.message);
      return;
    }
    setUsuarios((atual) => atual.map((u) => (u.id === id ? { ...u, papel: novoPapel } : u)));
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Usuários</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>
        Controle quem acessa o sistema e o que cada pessoa pode ver.
      </p>

      {erro && (
        <p className="alert-error" style={{ marginTop: 20 }}>
          {erro}
        </p>
      )}

      {senhaGerada && (
        <div
          className="card"
          style={{ marginTop: 20, padding: 20, borderColor: "var(--accent)" }}
        >
          <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
            Usuário criado! Repasse esta senha temporária para {senhaGerada.email}:
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: "monospace",
              fontSize: 18,
              background: "var(--bg-elevated-2)",
              padding: "8px 12px",
              borderRadius: 8,
              display: "inline-block",
            }}
          >
            {senhaGerada.senha}
          </p>
          <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Essa senha só aparece uma vez aqui. A pessoa pode trocá-la depois pelo link
            &quot;esqueci minha senha&quot; na tela de login.
          </p>
        </div>
      )}

      <h2 className="section-title">Convidar novo usuário</h2>
      <form onSubmit={handleConvidar} className="form-row">
        <label className="field">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label className="field">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Papel
          <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={convidando} className="btn btn-primary">
          {convidando ? "Criando..." : "Criar usuário"}
        </button>
      </form>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: -6, marginBottom: 24 }}>
        {PAPEL_DESCRICAO[papel]}
      </p>

      <h2 className="section-title">Equipe</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Papel</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>
                {u.nome ?? "-"} {u.souEu && <span className="badge badge-accent" style={{ marginLeft: 6 }}>Você</span>}
              </td>
              <td>{u.email ?? "-"}</td>
              <td>
                {u.souEu ? (
                  <span className="badge">{PAPEL_LABEL[(u.papel as Papel) ?? "operador"]}</span>
                ) : (
                  <select value={u.papel} onChange={(e) => handleMudarPapel(u.id, e.target.value)}>
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>
                        {PAPEL_LABEL[p]}
                      </option>
                    ))}
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
