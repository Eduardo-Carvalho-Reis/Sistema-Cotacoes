import { prisma } from "../prisma/lib/prisma";


export class ProdutoService {

    async criarProduto(dados) {
        return await prisma.produto.create({
            data: {
                nome: dados.nome,
                referencia: dados.referencia,
                nomePopular: dados.nomePopular,
                unidade: dados.unidade,
                precoAtual: dados.precoAtual
            }
        })



    }

    async listar() {
        const produtos = await prisma.produto.findMany();
        return produtos;

    }

    async excluir(id) {
        return await prisma.produto.delete({ where: { id:id } });
    
    }

    async atualizarProduto(id, dados) {
       return await prisma.produto.update({
            where: { id:id },
            data:{
             nome: dados.nome,
                referencia: dados.referencia,
                nomePopular: dados.nomePopular,
                unidade: dados.unidade,
                precoAtual: dados.precoAtual,
                ativo: dados.ativo

            }
        })

    }

    // Função de busca com diferentes paremetros
    async buscarProdutos(busca) {
        const produtos = await prisma.produto.findMany({
            where: busca ? {OR: [
            {nome: { contains: busca} },

            {referencia: { contains: busca}}]}

            : undefined
        });     
        return produtos;

    }


}