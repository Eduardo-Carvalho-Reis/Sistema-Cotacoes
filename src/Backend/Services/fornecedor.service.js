import { prisma } from "../prisma/lib/prisma";


export class FornecedorService {

    async criarFornecedor(dados) {
        return await prisma.fornecedor.create({
            data: {
                nome: dados.nome,
                cnpj: dados.cnpj,
                telefone: dados.telefone,
                endereco: dados.endereco,
                email: dados.email,
                ativo: dados.ativo
            }
        });
    }


    async listar() {
        const fornecedores = await prisma.fornecedor.findMany({ where: { ativo: true } });

        return fornecedores;
    }


    async excluir(id) {
        return await prisma.fornecedor.update({ where: { id }, data: { ativo: false } });
    }


    async atualizarFornecedor(id, dados) {
        return await prisma.fornecedor.update({
            where: {
                id: id
            },
            data: {
                nome: dados.nome,
                cnpj: dados.cnpj,
                telefone: dados.telefone,
                endereco: dados.endereco,
                email: dados.email,
                ativo: dados.ativo
            }
        });
    }


    // Função de busca por diferentes parâmetros
    async buscarFornecedores(busca) {
        const fornecedores = await prisma.fornecedor.findMany({
            where: busca
                ? {
                    ativo: true,
                    OR: [
                        {nome: {contains: busca}},
                        {
                        cnpj: {contains: busca}
                        },
                        {telefone: {contains: busca}}]}
                : { ativo: true }
        });

        return fornecedores;
    }

}
