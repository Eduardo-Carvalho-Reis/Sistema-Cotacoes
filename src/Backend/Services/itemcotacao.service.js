import { prisma } from "../prisma/lib/prisma";


export class ItemCotacaoService {

    async criarItemCotacao(dados) {
        return await prisma.itemCotacao.create({
            data: {
                cotacaoId: dados.cotacaoId,
                produtoId: dados.produtoId,
                quantidade: dados.quantidade,
                preco: dados.preco,
                observacao: dados.observacao
            }
        });
    }


    async listar() {
        const itens = await prisma.itemCotacao.findMany();

        return itens;
    }


    async excluir(id) {
        return await prisma.itemCotacao.delete({
            where: {
                id: id
            }
        });
    }


    async atualizarItemCotacao(id, dados) {
        return await prisma.itemCotacao.update({
            where: {
                id: id
            },
            data: {
                cotacaoId: dados.cotacaoId,
                produtoId: dados.produtoId,
                quantidade: dados.quantidade,
                preco: dados.preco,
                observacao: dados.observacao
            }
        });
    }


    async buscarItensCotacao(cotacaoId) {
        const itens = await prisma.itemCotacao.findMany({
            where: {
                cotacaoId: cotacaoId
            }
        });

        return itens;
    }

}