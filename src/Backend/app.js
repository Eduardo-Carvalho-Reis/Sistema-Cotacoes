import express from 'express';
import routerFornecedos from './Routes/fornecedor.routes.js';
import routerProdutos from './Routes/produto.routes.js';
import authRoutes from './Routes/auth.routes.js';
import catalogRoutes from './Routes/catalog.routes.js';
import workflowRoutes from './Routes/workflow.routes.js';
import { autenticar } from './middleware/auth.js';

const app = express();

app.use(express.urlencoded({ extended: true }));
// configuração para processar dados JSON
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use(autenticar);


// rotas de produto
app.use('/produto',routerProdutos);
// rotas de fornecedor
app.use('/fornecedor',routerFornecedos);
app.use('/api/catalogos', catalogRoutes);
app.use('/api', workflowRoutes);




export default app;
