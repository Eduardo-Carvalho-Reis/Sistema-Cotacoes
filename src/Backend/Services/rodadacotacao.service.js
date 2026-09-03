import { prisma } from "../prisma/lib/prisma.ts";

export class RodadaCotacaoService {
  // Cria uma rodada nova (criadoEm é preenchido sozinho pelo default do schema)
  async criarRodada(titulo) {
    const novaRodada = await prisma.rodadaCotacao.create({
      data: {
        titulo: titulo,
      },
    });

    return novaRodada;
  }

  // Busca todas as rodadas
  async listarRodadas() {
    const rodadas = await prisma.rodadaCotacao.findMany({
      orderBy: { criadoEm: "desc" },
    });

    return rodadas;
  }

  // Busca uma rodada específica, já trazendo as cotações dela
  async buscarRodadaPorId(id) {
    const rodada = await prisma.rodadaCotacao.findUnique({
      where: { id: id },
      include: { cotacoes: true },
    });

    return rodada;
  }

  // Atualiza os dados de uma rodada
  async atualizarRodada(id, dados) {
    return await prisma.rodadaCotacao.update({
      where: {
        id: id,
      },
      data: {
        titulo: dados.titulo,
      },
    });
  }

  // Apaga uma rodada
  async deletarRodada(id) {
    await prisma.rodadaCotacao.delete({ where: { id: id } });
  }
}