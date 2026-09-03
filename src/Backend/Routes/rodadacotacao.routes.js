import { Router } from "express";
import { RodadaCotacaoController } from "../Controlers/rodadacotacao.controler.js"

const router = Router();
const rodadaCotacaoController = new RodadaCotacaoController();

router.post('/', rodadaCotacaoController.criarRodada);
router.get('/', rodadaCotacaoController.listarRodadas);
router.get('/:id', rodadaCotacaoController.buscarRodadaPorId);
router.patch('/:id', rodadaCotacaoController.atualizarRodada);
router.delete('/:id', rodadaCotacaoController.deletarRodada);

export default router;