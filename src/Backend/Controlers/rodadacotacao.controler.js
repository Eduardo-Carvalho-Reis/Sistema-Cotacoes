import { RodadaCotacaoService } from "../services/rodadacotacao.service.js";

const rodadaCotacaoService = new RodadaCotacaoService();

export class RodadaCotacaoController {
  // POST /rodadas
  async criarRodada(req, res) {
    try {
      const { titulo } = req.body;

      const rodada = await rodadaCotacaoService.criarRodada(titulo);

      res.status(201).json(rodada);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  // GET /rodadas
  async listarRodadas(req, res) {
    try {
      const rodadas = await rodadaCotacaoService.listarRodadas();

      res.status(200).json(rodadas);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  // GET /rodadas/:id
  async buscarRodadaPorId(req, res) {
    try {
      const id = Number(req.params.id);

      const rodada = await rodadaCotacaoService.buscarRodadaPorId(id);

      if (!rodada) {
        return res.status(404).json({ mensagem: "Rodada não encontrada." });
      }

      res.status(200).json(rodada);
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  // PATCH /rodadas/:id
  async atualizarRodada(req, res) {
    try {
      const id = Number(req.params.id);

      const dados = req.body;

      await rodadaCotacaoService.atualizarRodada(id, dados);

      res.status(204).send();
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }

  // DELETE /rodadas/:id
  async deletarRodada(req, res) {
    try {
      const id = Number(req.params.id);

      await rodadaCotacaoService.deletarRodada(id);

      res.status(204).send();
    } catch (erro) {
      res.status(400).json({ mensagem: erro.message });
    }
  }
}