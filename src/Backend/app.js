import express from 'express';
import routerFornecedos from './Routes/fornecedor.routes.js';
import routerProdutos from './Routes/produto.routes.js';
import routerItemCotacao from './Routes/itemcotacao.route.js';
import routerCotacao from './Routes/cotacao.routes.js';
import routerRodadaCotacao from './Routes/rodadacotacao.routes.js';

const app = express();

app.use(express.urlencoded({ extended: true }));
// configuração para processar dados JSON
app.use(express.json());


// rotas de produto
app.use('/produto',routerProdutos);
// rotas de fornecedor
app.use('/fornecedor',routerFornecedos);
// rotas de itemCotacao
app.use('/itemcotacao',routerItemCotacao);
// rotas de cotacao
app.use('/cotacao',routerCotacao);
// rotas de rodadacotacao
app.use('/rodadacotacao',routerRodadaCotacao)




export default app;