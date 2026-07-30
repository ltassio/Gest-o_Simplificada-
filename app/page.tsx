export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>Gestão Simples — API</h1>
      <p>
        Este projeto expõe as API Routes financeiras do Gestão Simples.
        Não há interface aqui ainda — as rotas disponíveis são:
      </p>
      <ul>
        <li><code>POST /api/precificacao/calcular</code></li>
        <li><code>POST /api/caixa/atendimentos</code></li>
        <li><code>GET /api/caixa/resumo</code></li>
      </ul>
    </main>
  );
}
