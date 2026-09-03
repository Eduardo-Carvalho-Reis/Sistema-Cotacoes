import { Router } from "express";
import { CotacaoController } from "../Controlers/cotacao.controler";
 
const router = Router();
const cotacaoControler = new CotacaoController();
 
router.post("/", cotacaoControler.criarCotacao);
router.get("/",cotacaoControler.listarCotacoes);
router.get("/rodadas/:rodadaId/cotacoes", cotacaoControler.listarCotacoesPorRodada);
router.get("/:id", cotacaoControler.buscarCotacaoPorId);
router.patch("/:id/responder", cotacaoControler.responderCotacao);
router.patch("/:id/cancelar", cotacaoControler.cancelarCotacao);
router.delete("/:id", cotacaoControler.deletarCotacao);
 
export default router;