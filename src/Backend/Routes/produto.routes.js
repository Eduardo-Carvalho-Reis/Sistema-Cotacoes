import {Router} from 'express';
import { ProdutoController } from '../Controlers/produto.crontroler';

const produtoController=new ProdutoController();
const router = Router();

router.get('/',produtoController.listar);

router.get('/buscar',produtoController.buscar);

router.post('/',produtoController.criar);

router.delete('/:id',produtoController.deletar)

router.put('/:id',produtoController.atualizar)

export default router;