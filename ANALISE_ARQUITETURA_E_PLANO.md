# Diagnóstico da arquitetura e plano de evolução

## Etapa 1 — análise concluída

### Estrutura atual

- Frontend: React e Vite em `src/Frontend/`, com páginas separadas para cotações, respostas, aprovações, compras, relatórios, catálogo, WhatsApp e configurações.
- Backend: Node.js com Express 5 em `src/Backend/`; rotas de fluxo concentradas em `Routes/workflow.routes.js` e middleware JWT em `middleware/auth.js`.
- Persistência: PostgreSQL com Prisma 7; schema e migrations ficam em `src/Backend/prisma/`.
- Integração de mensagens: serviço `WhatsAppProvider` envia via URL e token globais em variáveis de ambiente; destinatários são associados a usuários.
- Execução/testes: scripts de dev e migração existem. O script `npm test` ainda é placeholder e não há suíte de testes identificada.

### Funcionalidades já implementadas

- Cadastro e listagem de obras, produtos, fornecedores, aplicações e usuários por catálogo.
- Cotação em rascunho, envio aos fornecedores, comparativo, respostas com itens solicitados e adicionais, encaminhamento das respostas e decisão de aprovação/rejeição por item.
- Criação de compra vinculada à cotação e à obra; seleção de ofertas mantém aprovador, quantidades e valores aprovados.
- Pedidos agrupados por fornecedor, confirmação, notas fiscais simples e recebimentos parciais por item.
- Cancelamento de compra com motivo; exclusão protegida por dependências/histórico em alguns fluxos.
- Histórico de status; relatórios/exportação CSV e PDF para gastos e comparativo de cotações.
- Destinatários WhatsApp (número/grupo) individualizados por usuário e histórico básico de envio por fornecedor.
- Login JWT, hash de senha e bootstrap para primeiro administrador.

### Lacunas e riscos prioritários

1. **Autorização por obra:** os tokens identificam perfil e usuário, mas o modelo `Usuario` não possui vínculo com `Obra`. As rotas de cotações, compras, pedidos e relatórios não filtram de forma geral pelo escopo da obra. A proteção atual é principalmente por perfil em algumas ações administrativas.
2. **Usuários:** CRUD de catálogo existe, mas não há fluxo consistente de convite/recuperação de senha; nomes de perfil do bootstrap e permissões não seguem exatamente os dois perfis pedidos.
3. **Cotações:** o fluxo ativo não oferece edição/cancelamento auditável e exclusão condicional de cotação. Estados estão divergentes do requisito: `EM_ANALISE`/`APROVADA` em vez de `EM_ANDAMENTO`/`CONCLUIDA`. Devem ser definidos mapeamentos e transições preservando registros existentes.
4. **Respostas:** rascunhos podem ser alterados e encaminhadas têm edição bloqueada, mas não há trilha de valores anteriores para respostas nem seleção de destinatários no envio. O histórico de mensagens atual é centrado nos envios a fornecedores.
5. **Compras/notas:** compra tem vínculo único com cotação e aprovação por item, mas não registra explicitamente solicitante, valor total consolidado nem evento de aprovação da compra. Nota fiscal é apenas criação, aceita várias notas por pedido e não versiona os arquivos/dados substituídos.
6. **Entrega:** recebimentos parciais por item já existem; faltam previsão, estado de atraso/cancelamento, responsável/observações dedicados e acompanhamento visual de entrega.
7. **Auditoria:** `HistoricoStatus` guarda transições de estado, não uma trilha central com operação, entidade, snapshots anteriores/novos e metadados. Algumas rotas ainda permitem mutação sem evento auditável.
8. **WhatsApp/notificações:** não há sessão própria por usuário, QR/status/reinício/desconexão, retentativas, idempotência de eventos nem política configurável de notificações. A integração atual de envio é global via `.env` e deve ser mantida compatível.
9. **Relatórios:** existem gastos agrupados e comparativo, mas não ranking completo, série de preços, filtros/categorias e consolidações mensais/percentuais gerenciais.
10. **Operação:** não foram encontrados testes automatizados, rotina de backup ou estratégia registrada de recuperação. `npm test` confirma ausência de suíte configurada. A validação de migrations depende de banco acessível.

### Proposta de implementação

A sequência mantém o backend como autoridade das regras e adiciona mudanças de schema em migrations Prisma compatíveis:

1. **Etapa 2 — base de domínio:** transições e compatibilidade de status, vínculo de usuário/obra e funções de autorização por obra, auditoria central e campos de autoria/aprovação. Adicionar testes de serviço/middleware.
2. **Etapa 3 — cotações e respostas:** edição e cancelamento com motivo, exclusão somente de rascunho sem relações/histórico, edição/versionamento de respostas e seleção/histórico de destinatários.
3. **Etapa 4 — compras:** aprovação transacional, gestão/versionamento de nota fiscal, estados de entrega e recebimentos parciais, telas correspondentes.
4. **Etapa 5 — usuários e WhatsApp:** gestão de contas/obras e recuperação segura; avaliar a versão/configuração real do WPPConnect antes de implementar endpoints de sessão, preservando envio existente.
5. **Etapa 6 — notificações e relatórios:** fila/histórico de notificações idempotentes com tentativas e relatórios gerenciais calculados dos dados persistidos.
6. **Etapa 7 — validação:** testes de regras, integração e isolamento por obra/sessão; revisar migrações e documentar backup/recuperação.

### Decisões que precisam de confirmação de regra antes de uma migração de dados

- Uma compra é única por cotação (`Compra.cotacaoEnvioId @unique`), mas pode conter itens aprovados de múltiplos fornecedores e gerar pedidos separados. O requisito de fornecedor selecionado deve continuar por item/pedido, sem impor fornecedor único à compra.
- O status `CONCLUIDA` será alcançado quando a aprovação gerar compra, conforme regra explícita do documento, embora a compra permaneça em andamento até pedidos/recebimentos. Confirmar se essa semântica deve ser mantida quando iniciarmos a etapa de migração.
- A alteração de `EM_ANALISE`/`APROVADA` para `EM_ANDAMENTO`/`CONCLUIDA` precisa de mapeamento dos registros atuais e não deve apagar nem reabrir dados.

## Limites da análise

A estrutura, schema, migrations e rotas/páginas existentes foram inspecionadas. Não foi feita conexão com banco de produção nem foram consultados valores do `.env`. A integração WPPConnect foi avaliada pelo cliente implementado e pela configuração documentada; a disponibilidade/versão do servidor não foi verificada.
