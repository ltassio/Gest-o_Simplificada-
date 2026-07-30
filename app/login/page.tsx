"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setCarregando(false);

    if (error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="page-center">
      <form onSubmit={handleSubmit} className="card" style={{ width: 360 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "var(--accent)",
              boxShadow: "0 0 12px var(--accent)",
            }}
          />
          <h1 className="card-title" style={{ margin: 0 }}>
            Gestão Simples
          </h1>
        </div>
        <p className="card-subtitle">Entre com seu e-mail e senha</p>

        {erro && <p className="alert-error">{erro}</p>}

        <label className="field">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="voce@exemplo.com"
          />
        </label>

        <label className="field">
          Senha
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={carregando}
          className="btn btn-primary btn-block"
          style={{ marginTop: 8 }}
        >
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
