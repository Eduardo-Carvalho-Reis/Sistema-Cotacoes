import { ProdutoService} from "../Services/produto.service";

const produtoService = new ProdutoService();

export class ProdutoController {

    async criar(req,res){
        try{
            const dados = req.body;
            
            const produtoCriado = await produtoService.criarProduto(dados);

            return res.status(201).json(produtoCriado) ; 

        } catch(erro){
            return res.status(501).json({
                erro: "Falha ao criar produto"
            });
            
        }
    }

    async buscar(req,res){
        try{
            const {busca} = req.query;

            const produtos = await produtoService.buscarProdutos(busca);

            return res.status(200).json(produtos);

        }catch(erro){
            return res.status(501).json({
                erro: "Falha ao busca"
            });

        }

    }

    async deletar(req,res){
        try{
           const id = Number(req.params.id);

            const produtoDeletado = await produtoService.excluir(id);

            return res.status(200).json(produtoDeletado);

        } catch(erro){
            return res.status(500).json({
                erro:"Falha ao deletar"
            });
        }
    }

    async atualizar(req,res){
        try{
            const id = Number(req.params.id);

            const dados = req.body;

            const produtoAtulizado = await produtoService.atualizarProduto(id,dados);
            
            return res.status(200).json(produtoAtulizado);

        }catch(erro){
             console.error(erro);

        return res.status(500).json({
                erro:"Falha ao atualizar"
            });
        }    

    }

    async listar(req,res){
        try{
            const produtos = await produtoService.listar();
            
             return res.status(200).json(produtos);
        }catch(erro){
             console.error(erro);

        return res.status(500).json({
                erro:"Falha ao listar"
            });
    }
}

}