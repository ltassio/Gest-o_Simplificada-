// Fallback de carregamento da rota /dashboard (Next.js App Router: um
// loading.tsx num segmento vira automaticamente o limite de Suspense
// daquele segmento). O Dashboard é um Server Component que só manda HTML
// depois de terminar todas as consultas (Score Geral, Fluxo de Caixa,
// Agenda, etc.) — sem este arquivo, clicar em "Dashboard" na sidebar
// parecia travado (nada acontecia na tela até tudo carregar). Com ele, o
// Next.js troca a tela por este spinner na hora do clique, e só troca de
// novo pelo conteúdo real quando os dados chegam.
export default function DashboardLoading() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <span>Carregando indicadores...</span>
    </div>
  );
}
