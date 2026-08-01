// Ver comentário em app/dashboard/loading.tsx — mesmo problema (Server
// Component buscando dado antes de renderizar) e mesma solução.
export default function FluxoCaixaLoading() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <span>Carregando fluxo de caixa...</span>
    </div>
  );
}
