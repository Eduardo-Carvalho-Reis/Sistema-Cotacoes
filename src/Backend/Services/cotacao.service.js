import { prisma } from "../prisma/lib/prisma.ts";


export class CotacaoService{
// Cria uma cotação nova (nasce com status ABERTA, que é o default do schema)
 async  criarCotacao(rodadaId, fornecedorId, observacao) {
  const novaCotacao = await prisma.cotacao.create({
    data: {
      rodadaId: rodadaId,
      fornecedorId: fornecedorId,
      observacao: observacao,
    },
  });

  return novaCotacao;
}

// Busca todas as cotações de uma rodada
async  listarCotacoesPorRodada(rodadaId) {
  const cotacoes = await prisma.cotacao.findMany({
    where: { rodadaId: rodadaId },
    include: { fornecedor: true, itens: true },
  });

  return cotacoes;
}

// Busca uma cotação específica pelo id
async  buscarCotacaoPorId(id) {
  const cotacao = await prisma.cotacao.findUnique({
    where: { id: id },
    include: { fornecedor: true, rodada: true, itens: true },
  });

  return cotacao;
}

// Marca a cotação como respondida e salva a data
async  responderCotacao(id) {
  const cotacaoAtualizada = await prisma.cotacao.update({
    where: { id: id },
    data: {
      status: "RESPONDIDA",
      dataResposta: new Date(),
    },
  });

  return cotacaoAtualizada;
}

async ListarCotacoes(){

  const listaCotacoes = await prisma.cotacao.findMany();

  return listaCotacoes;
}

// Cancela uma cotação
async cancelarCotacao(id) {
  const cotacaoAtualizada = await prisma.cotacao.update({
    where: { id: id },
    data: { status: "CANCELADA" },
  });

  return cotacaoAtualizada;
}

// Apaga uma cotação
async deletarCotacao(id) {
  await prisma.cotacao.delete({ where: { id: id } });
}

async atualizarCotacao(id, dados) {
    return await prisma.cotacao.update({
        where: {
            id: id
        },
        data: {
            rodadaId: dados.rodadaId,
            fornecedorId: dados.fornecedorId,
            status: dados.status,
            dataResposta: dados.dataResposta,
            observacao: dados.observacao
        }
    });
}

}