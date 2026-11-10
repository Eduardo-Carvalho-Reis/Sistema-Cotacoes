# Sistema de Gestão de Cotações e Compras

API em Node.js, Express, Prisma e PostgreSQL para cadastro operacional, cotações de fornecedores, comparação de ofertas, aprovação por item, pedidos, notas fiscais, recebimentos, histórico e relatórios.

## Configuração

1. Instale PostgreSQL e crie o banco `sistema_cotacoes`.
2. Copie `.env.example` para `.env` e configure `DATABASE_URL` e `JWT_SECRET`.
3. Execute `npm install`, `npm run db:generate` e `npm run db:migrate`.
4. Inicie a API com `npm run dev` (ou `npm start`). A porta padrão é 3000.
5. Crie o primeiro usuário de sistema com `POST /auth/bootstrap` usando `nome`, `email` e `senha` (mínimo 10 caracteres). O bootstrap só funciona enquanto não houver usuários.

## API

`GET /health` verifica a disponibilidade. `POST /auth/login` recebe e-mail e senha e retorna um token JWT válido por 8 horas. Envie `Authorization: Bearer <token>` nas rotas autenticadas.

- `/api/catalogos`: obras, equipamentos, aplicações, usuários, perfis e associação produto-fornecedor.
- `/produto` e `/fornecedor`: cadastro, busca e atualização de produtos e fornecedores.
- `/api/cotacoes`: cotação de envio com obra, itens e fornecedores; `/:id/comparativo` compara respostas e `/:id/enviar` envia mensagens individuais.
- `/api/respostas`: respostas e ofertas; `/:id/encaminhar` finaliza preenchimento.
- `/api/respostas/:id/itens`: inclui, edita e remove itens enquanto a resposta está em preenchimento.
- `/api/compras/aprovar`: aprova/rejeita ofertas e quantidades; `/api/compras/:id/pedidos` agrupa as aprovações por fornecedor e `/:id/encerrar-analise` encerra ofertas pendentes.
- `/api/pedidos`: confirmação, notas fiscais e recebimentos parciais por item.
- `/api/relatorios/gastos`: filtros `obraId`, `de`, `ate`, `agruparPor` (obra, fornecedor ou produto) e `formato=csv|pdf`; `/api/relatorios/cotacoes` exporta comparativos com os mesmos formatos.
- `/api/historico`: consulta trilha de alterações.

O envio de WhatsApp é independente do provedor. Configure `WHATSAPP_PROVIDER_URL` para um endpoint que aceite `POST` JSON com `telefone` e `mensagem`, além do cabeçalho `Idempotency-Key`; a resposta pode conter `id` ou `messageId`. Falhas por destinatário são registradas sem interromper os demais envios.
