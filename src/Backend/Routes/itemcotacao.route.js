import { Router } from "express";
import { ItemCotacaoController } from "../Controlers/itemcotacao.controler.js";
const router = Router();

const itemCotacaoController = new ItemCotacaoController();


router.get("/", itemCotacaoController.listar);

router.get("/cotacao/:cotacaoId", itemCotacaoController.buscar);

router.post("/", itemCotacaoController.criar);

router.patch("/:id", itemCotacaoController.atualizar);

router.delete("/:id", itemCotacaoController.deletar);


export default router;