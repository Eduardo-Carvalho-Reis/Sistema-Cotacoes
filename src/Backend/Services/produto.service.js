import { prisma } from "../prisma/lib/prisma";


export class ProdutoService {

    async criarProduto(dados) {
        if (dados.precoAtual != null && Number(dados.precoAtual) < 0) throw new Error("Preço não pode ser negativo.");
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
        const produtos = await prisma.produto.findMany({ where: { ativo: true } });
        return produtos;

    }

    async excluir(id) {
        return await prisma.produto.update({ where: { id }, data: { ativo: false } });
    
    }

    async atualizarProduto(id, dados) {
       if (dados.precoAtual != null && Number(dados.precoAtual) < 0) throw new Error("Preço não pode ser negativo.");
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
            where: {
                ativo: true,
                ...(busca ? { OR: [
                    { nome: { contains: busca } },
                    { referencia: { contains: busca } }
                ] } : {})
            }
        });     
        return produtos;

    }


}
