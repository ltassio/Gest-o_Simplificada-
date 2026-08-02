// Ver comentário em app/dashboard/loading.tsx — mesmo problema (Server
// Component buscando dado antes de renderizar) e mesma solução.
export default function LtvLoading() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <span>Carregando LTV...</span>
    </div>
  );
}
