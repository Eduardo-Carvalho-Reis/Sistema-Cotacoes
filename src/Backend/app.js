import express from 'express';
import routerProdutos from './Routes/produto.routes';

const app = express();

app.use(express.urlencoded({ extended: true }));
// configuração para processar dados JSON
app.use(express.json());

// rotas de produto
app.use('/produto',routerProdutos);

export default app;