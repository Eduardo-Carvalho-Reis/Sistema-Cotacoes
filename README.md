# Sistema de Gestão de Cotações e Compras

API em Node.js, Express, Prisma e PostgreSQL para cadastro operacional, cotações de fornecedores, comparação de ofertas, aprovação por item, pedidos, notas fiscais, recebimentos, histórico e relatórios.

## Configuração

1. Instale PostgreSQL e crie o banco `sistema_cotacoes`.
2. Copie `.env.example` para `.env` e configure `DATABASE_URL` e `JWT_SECRET`.
3. Execute `npm install`, `npm run db:generate` e `npm run db:migrate`.
4. Inicie o projeto com `npm run dev`. Esse comando sobe a API e a interface Vite juntos. A API usa a porta 3000 e a interface usa a porta 5173.
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

### Integracao com WPPConnect Server

1. Suba o WPPConnect Server e configure nele uma `SECRET_KEY` forte. O Swagger fica disponivel em `/api-docs` na instancia.
2. Para conexões individuais pela interface, configure no `.env` da raiz `WHATSAPP_SERVER_URL`, `WHATSAPP_SERVER_SECRET_KEY` e `WPP_TOKEN_ENCRYPTION_KEY` (segredo aleatório forte, persistente e exclusivo da aplicação). O backend cria uma sessão por usuário, guarda o token criptografado e expõe somente QR Code e status ao próprio usuário.
3. Na tela WhatsApp, clique em conectar e leia o QR Code com o WhatsApp do usuário. A interface permite consultar status, reiniciar e desconectar.
4. `WHATSAPP_PROVIDER_URL` e `WHATSAPP_PROVIDER_TOKEN` continuam disponíveis como integração global legada/fallback. Sessões individuais utilizam as rotas documentadas pelo WPPConnect Server; confirme a compatibilidade com a versão instalada no Swagger local.

O backend envia JSON com `phone` e `message`; telefones devem incluir codigo do pais e DDD, por exemplo `5511999999999`. Consulte a [documentacao oficial da API](https://wppconnect.io/swagger/wppconnect-server/) para detalhes. Falhas por destinatario sao registradas sem interromper os demais envios.

## Interface React

A interface Vite fica em `src/Frontend/`. Depois de instalar as dependências da raiz e da interface (`npm install` e `npm install --prefix src/Frontend`), use `npm run dev` na raiz para iniciar API e interface juntas. Abra `http://localhost:5173`. O Vite encaminha as chamadas da interface para a API local na porta 3000. Para gerar os arquivos de produção, use `npm run build --prefix src/Frontend`.
