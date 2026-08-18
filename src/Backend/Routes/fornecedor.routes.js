import {Router} from "express";
import { FornecedorController } from "../Controlers/fornecedor.controler.js";

const fornecedorController = new FornecedorController();
const router = Router();

router.get('/',fornecedorController.listar);

router.get('/buscar',fornecedorController.buscar);

router.post('/',fornecedorController.criar)

router.put('/:id',fornecedorController.atualizar);

router.delete('/:id',fornecedorController.deletar)

export default router;
