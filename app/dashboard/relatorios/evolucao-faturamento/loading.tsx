// Ver comentário em app/dashboard/loading.tsx — mesmo problema (Server
// Component buscando dado antes de renderizar) e mesma solução.
export default function EvolucaoFaturamentoLoading() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <span>Carregando evolução do faturamento...</span>
    </div>
  );
}
