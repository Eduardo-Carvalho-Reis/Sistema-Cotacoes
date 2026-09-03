import { CotacaoService } from "../services/cotacao.service.js"; 

const cotacaoService = new CotacaoService();

export class CotacaoController {

  async criarCotacao(req, res) {
    try {
      const { rodadaId, fornecedorId, observacao } = req.body;

      const cotacao = await cotacaoService.criarCotacao(rodadaId, fornecedorId, observacao);

      res.status(201).json(cotacao);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }


  async listarCotacoesPorRodada(req, res) {
    try {
      const { rodadaId } = req.params;

      const cotacoes = await cotacaoService.listarCotacoesPorRodada(Number(rodadaId));

      res.status(200).json(cotacoes);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  async listarCotacoes(req,res){
    try{
      const listaCotacoes = await cotacaoService.ListarCotacoes();
      
      res.status(200).json(listaCotacoes);
    
    }catch (erro){
      res.status(400).json({mensagem:erro.message})
    }
  }


  async buscarCotacaoPorId(req, res) {
    try {

    
        const id = Number(req.params.id);


      const cotacao = await cotacaoService.buscarCotacaoPorId(id);

      if (!cotacao) {
        return res.status(404).json({ mensagem: "Cotação não encontrada." });
      }

      res.status(200).json(cotacao);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  async responderCotacao(req, res) {
    try {
    const id = Number(req.params.id);

      const cotacao = await cotacaoService.responderCotacao(id);

      res.status(200).json(cotacao);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  async cancelarCotacao(req, res) {
    try {
     const id = Number(req.params.id);

      const cotacao = await cotacaoService.cancelarCotacao(id);

      res.status(200).json(cotacao);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  async deletarCotacao(req, res) {
    try {
      const id = Number(req.params.id);

      await cotacaoService.deletarCotacao(id);

      res.status(204).send();
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }
    async atualizarCotacao(req,res){
        try{
            const id = Number(req.params.id);

            const dados = req.body;

           const cotacaoAtualizada = await cotacaoService.atualizarCotacao(id, dados);
res.status(200).json(cotacaoAtualizada)
        } catch (erro){
            res.status(400).json({mensagem: erro.message});
        }} 
}