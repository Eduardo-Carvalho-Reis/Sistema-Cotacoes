import express from 'express';
import routerFornecedos from './Routes/fornecedor.routes.js';
import routerProdutos from './Routes/produto.routes.js';

const app = express();

app.use(express.urlencoded({ extended: true }));
// configuração para processar dados JSON
app.use(express.json());

// rotas de produto
app.use('/produto',routerProdutos);

app.use('/fornecedor',routerFornecedos);

export default app;