import { prisma } from "./prisma";

export interface ResumoPorProfissional {
  profissional_id: string;
  profissional_nome: string;
  total_cobrado: number;
  total_comissao: number;
  total_estudio: number;
  quantidade_atendimentos: number;
}

export interface ResumoCaixa {
  periodo: { data_inicio: string; data_fim: string };
  total_cobrado: number;
  total_comissoes: number;
  total_estudio: number;
  quantidade_atendimentos: number;
  por_profissional: ResumoPorProfissional[];
}

// Agregação do Caixa (Documentação da API v1.0, Seção 5), extraída para um
// único lugar porque é usada tanto pela rota GET /api/caixa/resumo (chamada
// pelo front-end autenticado, via Bearer token) quanto diretamente pelo
// Dashboard (Server Component, mesmo processo — não precisa ir e voltar
// por HTTP nem carregar um token, já que o tenant_id já é conhecido ali).
export async function getResumoCaixa(
  tenantId: string,
  inicio: Date,
  fim: Date
): Promise<ResumoCaixa> {
  const atendimentos = await prisma.atendimento.findMany({
    where: {
      tenantId,
      dataAtendimento: { gte: inicio, lte: fim },
    },
    include: { profissional: { select: { id: true, nome: true } } },
  });

  let totalCobrado = 0;
  let totalComissoes = 0;
  let totalEstudio = 0;

  const porProfissionalMap = new Map<string, ResumoPorProfissional>();

  for (const a of atendimentos) {
    const valorCobrado = Number(a.valorCobrado);
    const valorComissao = Number(a.valorComissao);
    const valorEstudio = Number(a.valorEstudio);

    totalCobrado += valorCobrado;
    totalComissoes += valorComissao;
    totalEstudio += valorEstudio;

    const chave = a.profissionalId;
    const atual = porProfissionalMap.get(chave) ?? {
      profissional_id: a.profissionalId,
      profissional_nome: a.profissional.nome,
      total_cobrado: 0,
      total_comissao: 0,
      total_estudio: 0,
      quantidade_atendimentos: 0,
    };
    atual.total_cobrado = round2(atual.total_cobrado + valorCobrado);
    atual.total_comissao = round2(atual.total_comissao + valorComissao);
    atual.total_estudio = round2(atual.total_estudio + valorEstudio);
    atual.quantidade_atendimentos += 1;
    porProfissionalMap.set(chave, atual);
  }

  return {
    periodo: {
      data_inicio: inicio.toISOString().slice(0, 10),
      data_fim: fim.toISOString().slice(0, 10),
    },
    total_cobrado: round2(totalCobrado),
    total_comissoes: round2(totalComissoes),
    total_estudio: round2(totalEstudio),
    quantidade_atendimentos: atendimentos.length,
    por_profissional: Array.from(porProfissionalMap.values()),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
