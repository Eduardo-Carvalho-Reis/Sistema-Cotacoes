# Sistema de Cotações

Aplicação web para organizar obras, produtos e fornecedores, solicitar cotações, registrar propostas, comparar preços e acompanhar aprovações, pedidos e compras. O envio de mensagens de WhatsApp pode ser integrado ao WPPConnect Server.

## Tecnologias

- Backend: Node.js, Express e Prisma 7.
- Frontend: React e Vite.
- Banco de dados: PostgreSQL.
- Mensagens: WPPConnect Server (opcional).

## Requisitos

- Node.js 20.19 ou superior (ou 22.12 ou superior) e npm.
- PostgreSQL acessível pelo computador/servidor da aplicação.
- Git, caso vá clonar o repositório.
- Para mensagens WhatsApp: uma instância independente do WPPConnect Server acessível pelo backend. O WPPConnect não é instalado nem iniciado pelos comandos deste repositório.

## 1. Obter o código e instalar dependências

Na raiz do projeto:

```powershell
git clone https://github.com/Eduardo-Carvalho-Reis/Sistema-Cotacoes.git
cd Sistema-Cotacoes
npm install
npm install --prefix src/Frontend
```

Se você já tem o projeto, entre na pasta `Sistema-Cotacoes` e execute os comandos de instalação conforme necessário.

## 2. Preparar o PostgreSQL

Inicie o PostgreSQL e crie um banco vazio. Por exemplo, com o cliente `psql` instalado:

```powershell
psql -U postgres -c "CREATE DATABASE sistema_cotacoes;"
```

Se o banco já existir, não é necessário criá-lo novamente. Guarde o usuário, senha, endereço e porta usados pelo PostgreSQL: eles serão informados em `DATABASE_URL`.

## 3. Configurar o `.env`

O arquivo `.env` fica na raiz do projeto. Crie-o a partir do modelo:

```powershell
Copy-Item .env.example .env
notepad .env
```

Edite as variáveis antes de iniciar o sistema. `.env` contém segredos e não deve ser enviado ao Git.

### Variáveis do sistema

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Conexão PostgreSQL no formato `postgresql://USUARIO:SENHA@HOST:PORTA/BANCO?schema=public`. Ajuste usuário, senha, host, porta e banco. Caracteres especiais na senha devem ser codificados para URL. |
| `JWT_SECRET` | Sim | Segredo usado para assinar os tokens de autenticação. Troque o valor de exemplo por uma sequência longa, aleatória e privada. Use o mesmo valor enquanto os tokens emitidos precisarem continuar válidos. |
| `PORT` | Não | Porta HTTP do backend; o padrão é `3000`. O proxy de desenvolvimento do Vite aponta para `localhost:3000`, então, se alterar a porta, ajuste também `src/Frontend/vite.config.js`. |
| `BOOTSTRAP_ADMIN_NAME` | Para o seed inicial | Nome do primeiro administrador. |
| `BOOTSTRAP_ADMIN_EMAIL` | Para o seed inicial | E-mail usado para entrar no sistema. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Para o seed inicial | Senha inicial; o seed exige pelo menos 10 caracteres. Substitua a senha de exemplo por uma forte antes de executar o seed. |

Exemplo de `DATABASE_URL` para a configuração padrão local do modelo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sistema_cotacoes?schema=public"
```

Altere `postgres:postgres` caso seu usuário ou senha sejam diferentes. Não use essa senha de exemplo em ambientes compartilhados ou de produção.

### Credenciais do administrador inicial

O administrador é criado pelo seed, não por uma tela de primeiro acesso. Revise `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` no `.env` antes de rodar `npm run db:seed`. O seed cria um administrador somente quando ainda não há usuários cadastrados; caso já existam usuários, ele não cria outro. A senha é armazenada com hash.

## 4. Banco: gerar cliente, aplicar migrações e criar administrador

Com o `.env` preenchido e o PostgreSQL acessível, execute na raiz:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

- `db:generate` gera o cliente Prisma usado pelo backend.
- `db:migrate` aplica ao banco as migrações versionadas do projeto.
- `db:seed` cria o perfil e o primeiro usuário administrador, se ainda não houver usuários.

Para consultar o estado das migrações:

```powershell
npm run db:status
```

## 5. Iniciar o sistema em desenvolvimento

```powershell
npm run dev
```

Esse comando inicia backend e frontend juntos. Acesse **http://localhost:5173** e entre com o e-mail e a senha configurados para o seed. O backend atende em **http://localhost:3000** por padrão. O Vite encaminha para ele as requisições da aplicação durante o desenvolvimento.

Para iniciar cada parte separadamente, use dois terminais na raiz:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

O terminal do backend deve indicar que conectou ao banco e está ouvindo na porta configurada. Se a conexão falhar, confira `DATABASE_URL`, o estado do PostgreSQL e se as migrações foram aplicadas.

## 6. Configurar o WPPConnect Server

O backend envia mensagens para um WPPConnect Server separado. Configure e inicie esse serviço de acordo com o ambiente em que ele está instalado; ele precisa estar acessível a partir do backend. A porta padrão usada nos exemplos é `21465`, mas use a porta e o endereço reais da sua instalação.

O código suporta dois modos de envio:

1. **Sessão individual por usuário (opcional):** cada usuário conecta seu próprio WhatsApp por QR Code na página **Configurações → WhatsApp**. Quando há sessão individual conectada e credencial armazenada, o envio usa essa sessão.
2. **Sessão padrão do servidor (alternativa/fallback):** o backend envia pela URL e token em `WHATSAPP_PROVIDER_URL` e `WHATSAPP_PROVIDER_TOKEN` quando não há uma sessão individual disponível para aquele usuário.

### Opção A: sessão padrão para envio

1. No WPPConnect Server, configure a chave secreta (`SECRET_KEY`) e inicie o serviço.
2. Crie/inicie a sessão desejada no WPPConnect e gere o token dela pelo endpoint `POST /api/<sessao>/<SECRET_KEY>/generate-token`.
3. Copie o token completo retornado pelo endpoint.
4. Preencha no `.env`:

```env
WHATSAPP_PROVIDER_URL=http://localhost:21465/api/minha-sessao/send-message
WHATSAPP_PROVIDER_TOKEN=token_completo_retornado_pelo_wppconnect
```

Troque `localhost:21465` pelo endereço alcançável pelo backend e `minha-sessao` pelo nome real da sessão. O token é enviado no cabeçalho `Authorization: Bearer ...`. Para envio, o backend faz `POST` para `WHATSAPP_PROVIDER_URL` com JSON no formato `{ "phone": "5511999999999", "message": "Texto" }`. O WPPConnect deve aceitar o formato padrão do endpoint `send-message`.

Se o WPPConnect Server estiver em outro container ou máquina, `localhost` normalmente aponta para o próprio ambiente do backend; use o nome DNS, IP ou endereço interno correto. Reinicie o backend após mudar o `.env`.

### Opção B: sessões individuais por usuário e QR Code

Configure as três variáveis abaixo no `.env` do backend:

```env
WHATSAPP_SERVER_URL=http://localhost:21465
WHATSAPP_SERVER_SECRET_KEY=mesma_SECRET_KEY_configurada_no_WPPConnect
WPP_TOKEN_ENCRYPTION_KEY=uma_chave_aleatoria_longa_e_privada
```

- `WHATSAPP_SERVER_URL`: endereço base do WPPConnect Server, sem `/api` no final.
- `WHATSAPP_SERVER_SECRET_KEY`: chave configurada no WPPConnect Server. O backend usa essa chave para gerar o token de cada sessão.
- `WPP_TOKEN_ENCRYPTION_KEY`: segredo local usado para criptografar no banco os tokens das sessões. Gere uma chave aleatória, por exemplo no PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie a saída para `.env` e mantenha-a estável e privada. Se trocar essa chave, tokens de sessões já salvos deixam de poder ser descriptografados; os usuários poderão precisar conectar novamente. Não compartilhe esse valor nem o salve no repositório.

Depois de configurar, reinicie o backend, entre no sistema e acesse **Configurações → WhatsApp**. Use a opção para conectar/reiniciar a sessão e leia o QR Code com o WhatsApp correspondente. Cada conta de usuário tem sua própria sessão. Sem as três variáveis, a área de sessão individual informa que não está configurada.

### Destinatários e operação

Na página WhatsApp, cada usuário cadastra sua própria lista de destinatários: número com código do país e DDD (somente números são enviados ao provedor) ou ID de grupo terminado normalmente em `@g.us`. A lista é usada ao encaminhar comparativos/respostas. A disponibilidade de envio depende de uma sessão individual ou do provedor padrão configurado e conectado.

Não coloque o token retornado pelo WPPConnect, `SECRET_KEY`, `JWT_SECRET` ou a chave de criptografia em código-fonte, capturas de tela públicas ou repositórios. Restrinja o acesso de rede ao serviço WPPConnect e use HTTPS quando a comunicação atravessar redes não confiáveis.

## 7. Build e execução fora do modo de desenvolvimento

Gere os arquivos estáticos do frontend com:

```powershell
npm run build --prefix src/Frontend
```

O resultado fica em `src/Frontend/dist`. O backend deste projeto inicia a API; publique os arquivos do frontend por um servidor web configurado para encaminhar as rotas de API ao backend. Configure também o endereço da API conforme o ambiente de publicação.

Para iniciar o backend sem o modo de observação de arquivos:

```powershell
npm start
```

Antes de uma implantação, configure as variáveis do ambiente no serviço de execução e aplique as migrações (`npm run db:migrate`). Não use credenciais de exemplo em produção.

## Módulos do sistema

- **Painel:** visão geral das movimentações e pendências.
- **Cotações:** criação de solicitações, seleção de fornecedores e acompanhamento das respostas.
- **Respostas:** registro e comparação das propostas recebidas, com possibilidade de encaminhar comparativos aos destinatários cadastrados.
- **Aprovações:** análise e aprovação das compras conforme o fluxo do sistema.
- **Pedidos e compras:** acompanhamento dos pedidos, itens, entregas, notas fiscais e totais.
- **Cadastros:** manutenção de obras, fornecedores, produtos e demais dados usados nos fluxos.
- **Relatórios:** consulta e exportação de informações de compras e cotações.
- **Configurações:** usuários, permissões e configuração de destinatários/sessão do WhatsApp conforme o perfil.

O acesso a obras e ações disponíveis depende das permissões e vínculos cadastrados para cada usuário.

## Backup PostgreSQL

Há um script PowerShell em `scripts/backup-postgres.ps1`. Execute a partir do PowerShell; consulte os parâmetros e observações no próprio script antes de usar. Os arquivos de backup são gravados na pasta `backups/`, que está excluída do Git. Mantenha cópias de segurança em local protegido e teste o processo de restauração do seu ambiente.

## Solução de problemas

- **Erro de conexão com o banco:** confirme que o PostgreSQL está iniciado, que o banco existe e que os dados de `DATABASE_URL` estão corretos.
- **Tabelas não encontradas ou schema desatualizado:** rode `npm run db:migrate` e confira com `npm run db:status`.
- **Login do primeiro administrador não funciona:** confira as credenciais configuradas antes do seed. O seed não redefine nem cria o administrador se já houver qualquer usuário.
- **Frontend não alcança o backend:** confirme que o backend está ouvindo na porta 3000, que o proxy do Vite aponta para a mesma porta e que o frontend está em `http://localhost:5173`.
- **WhatsApp não envia:** confirme que o WPPConnect está ativo e acessível a partir do backend, que a sessão está conectada, que o nome da sessão/URL e o token são correspondentes e que o destinatário tem um telefone válido ou ID de grupo correto. Verifique os logs do backend e do WPPConnect.
- **Erro ao conectar sessão individual:** valide as três variáveis `WHATSAPP_SERVER_URL`, `WHATSAPP_SERVER_SECRET_KEY` e `WPP_TOKEN_ENCRYPTION_KEY`; confirme que a chave secreta corresponde ao WPPConnect e que o token não ficou inválido após trocar a chave de criptografia.
