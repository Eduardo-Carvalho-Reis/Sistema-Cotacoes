import { FornecedorService } from "../Services/fornecedor.service.js";

const fornecedorService = new FornecedorService();


export class FornecedorController {

    async criar(req, res) {
        try {
            const dados = req.body;

            const fornecedorCriado =
                await fornecedorService.criarFornecedor(dados);

            return res.status(201).json(fornecedorCriado);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao criar fornecedor"
            });
        }
    }


    async listar(req, res) {
        try {
            const fornecedores = await fornecedorService.listar();

            return res.status(200).json(fornecedores);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao listar fornecedores"
            });
        }
    }


    async buscar(req, res) {
        try {
            const { busca } = req.query;

            const fornecedores =
                await fornecedorService.buscarFornecedores(busca);

            return res.status(200).json(fornecedores);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao buscar fornecedores"
            });
        }
    }


    async deletar(req, res) {
        try {
            const id = Number(req.params.id);

            const fornecedorDeletado =
                await fornecedorService.excluir(id);

            return res.status(200).json(fornecedorDeletado);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao deletar fornecedor"
            });
        }
    }


    async atualizar(req, res) {
        try {
            const id = Number(req.params.id);

            const dados = req.body;

            const fornecedorAtualizado =
                await fornecedorService.atualizarFornecedor(id, dados);

            return res.status(200).json(fornecedorAtualizado);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao atualizar fornecedor"
            });
        }
    }

}