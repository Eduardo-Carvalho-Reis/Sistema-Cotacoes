import { ItemCotacaoService } from "../Services/itemcotacao.service.js";

const itemCotacaoService = new ItemCotacaoService();


export class ItemCotacaoController {

    async criar(req, res) {
        try {
            const dados = req.body;

            const itemCriado =
                await itemCotacaoService.criarItemCotacao(dados);

            return res.status(201).json(itemCriado);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao criar item da cotação"
            });
        }
    }


    async listar(req, res) {
        try {
            const itens =
                await itemCotacaoService.listar();

            return res.status(200).json(itens);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao listar itens da cotação"
            });
        }
    }


    async buscar(req, res) {
        try {
            const { cotacaoId } = req.params;

            const itens =
                await itemCotacaoService.buscarItensCotacao(
                    Number(cotacaoId)
                );

            return res.status(200).json(itens);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao buscar itens da cotação"
            });
        }
    }


    async atualizar(req, res) {
        try {
            const id = Number(req.params.id);

            const dados = req.body;

            const itemAtualizado =
                await itemCotacaoService.atualizarItemCotacao(
                    id,
                    dados
                );

            return res.status(200).json(itemAtualizado);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao atualizar item da cotação"
            });
        }
    }


    async deletar(req, res) {
        try {
            const id = Number(req.params.id);

            const itemDeletado =
                await itemCotacaoService.excluir(id);

            return res.status(200).json(itemDeletado);

        } catch (erro) {
            console.error(erro);

            return res.status(500).json({
                erro: "Falha ao deletar item da cotação"
            });
        }
    }

}