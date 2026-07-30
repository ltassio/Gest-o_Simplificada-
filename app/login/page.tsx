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
    <main style={styles.main}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Gestão Simples</h1>
        <p style={styles.subtitle}>Entre com seu e-mail e senha</p>

        <label style={styles.label}>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            autoComplete="email"
          />
        </label>

        <label style={styles.label}>
          Senha
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
          />
        </label>

        {erro && <p style={styles.erro}>{erro}</p>}

        <button type="submit" disabled={carregando} style={styles.botao}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "sans-serif",
    background: "#f5f5f5",
  },
  card: {
    background: "#fff",
    padding: 32,
    borderRadius: 8,
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    width: 320,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  title: { margin: 0 },
  subtitle: { margin: 0, color: "#666", fontSize: 14 },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 14 },
  input: { padding: 8, borderRadius: 4, border: "1px solid #ccc", fontSize: 14 },
  erro: { color: "#c0392b", fontSize: 13, margin: 0 },
  botao: {
    marginTop: 8,
    padding: "10px 16px",
    borderRadius: 4,
    border: "none",
    background: "#111",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
};
