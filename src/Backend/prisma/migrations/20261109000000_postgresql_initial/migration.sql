-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoAplicacao" AS ENUM ('EQUIPAMENTO', 'AREA');

-- CreateEnum
CREATE TYPE "StatusCotacaoEnvio" AS ENUM ('RASCUNHO', 'ENVIADA', 'EM_ANALISE', 'APROVADA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusEnvio" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusResposta" AS ENUM ('PREENCHIMENTO', 'ENCAMINHADA', 'APROVADA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusOferta" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "StatusCompra" AS ENUM ('APROVACAO', 'PEDIDOS_ABERTOS', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusSelecao" AS ENUM ('APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('AGUARDANDO_CONFIRMACAO', 'CONFIRMADO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "Perfil" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfilId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "chassi" TEXT,
    "potenciaCapacidade" TEXT,
    "ano" INTEGER,
    "placa" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aplicacao" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoAplicacao" NOT NULL,
    "equipamentoId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Aplicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "endereco" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "referencia" TEXT,
    "nomePopular" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "precoAtual" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoFornecedor" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "precoReferencia" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProdutoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoEnvio" (
    "id" SERIAL NOT NULL,
    "obraId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "status" "StatusCotacaoEnvio" NOT NULL DEFAULT 'RASCUNHO',

    CONSTRAINT "CotacaoEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoEnvioItem" (
    "id" SERIAL NOT NULL,
    "cotacaoEnvioId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "quantidadeSolicitada" DECIMAL(12,3) NOT NULL,
    "unidade" TEXT NOT NULL,
    "aplicacaoId" INTEGER,

    CONSTRAINT "CotacaoEnvioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoEnvioFornecedor" (
    "id" SERIAL NOT NULL,
    "cotacaoEnvioId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "statusEnvio" "StatusEnvio" NOT NULL DEFAULT 'PENDENTE',
    "dataEnvio" TIMESTAMP(3),
    "identificadorExterno" TEXT,
    "telefone" TEXT,
    "erro" TEXT,

    CONSTRAINT "CotacaoEnvioFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoResposta" (
    "id" SERIAL NOT NULL,
    "cotacaoEnvioId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "usuarioPreenchimentoId" INTEGER,
    "dataResposta" TIMESTAMP(3),
    "observacao" TEXT,
    "status" "StatusResposta" NOT NULL DEFAULT 'PREENCHIMENTO',

    CONSTRAINT "CotacaoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoRespostaItem" (
    "id" SERIAL NOT NULL,
    "cotacaoRespostaId" INTEGER NOT NULL,
    "cotacaoEnvioItemId" INTEGER,
    "produtoId" INTEGER NOT NULL,
    "quantidadeOfertada" DECIMAL(12,3) NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "indisponivel" BOOLEAN NOT NULL DEFAULT false,
    "adicional" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusOferta" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,

    CONSTRAINT "CotacaoRespostaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" SERIAL NOT NULL,
    "obraId" INTEGER NOT NULL,
    "cotacaoEnvioId" INTEGER NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusCompra" NOT NULL DEFAULT 'APROVACAO',

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelecaoCompraItem" (
    "id" SERIAL NOT NULL,
    "compraId" INTEGER NOT NULL,
    "cotacaoRespostaItemId" INTEGER NOT NULL,
    "quantidadeAprovada" DECIMAL(12,3) NOT NULL,
    "valorUnitarioAprovado" DECIMAL(12,2) NOT NULL,
    "aprovadorId" INTEGER NOT NULL,
    "dataAprovacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusSelecao" NOT NULL,

    CONSTRAINT "SelecaoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" SERIAL NOT NULL,
    "compraId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "dataPedido" TIMESTAMP(3),
    "status" "StatusPedido" NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO',

    CONSTRAINT "PedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompraItem" (
    "id" SERIAL NOT NULL,
    "pedidoCompraId" INTEGER NOT NULL,
    "selecaoCompraItemId" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PedidoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" SERIAL NOT NULL,
    "pedidoCompraId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "arquivoReferencia" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTRADA',

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecebimentoItem" (
    "id" SERIAL NOT NULL,
    "pedidoCompraItemId" INTEGER NOT NULL,
    "quantidadeRecebida" DECIMAL(12,3) NOT NULL,
    "dataRecebimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "RecebimentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoStatus" (
    "id" SERIAL NOT NULL,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "cotacaoEnvioId" INTEGER,
    "compraId" INTEGER,
    "pedidoCompraId" INTEGER,

    CONSTRAINT "HistoricoStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoEnvioMensagem" (
    "id" SERIAL NOT NULL,
    "cotacaoEnvioFornecedorId" INTEGER NOT NULL,
    "telefone" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusEnvio" NOT NULL,
    "erro" TEXT,
    "identificadorExterno" TEXT,

    CONSTRAINT "HistoricoEnvioMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_nome_key" ON "Perfil"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cnpj_key" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE INDEX "Fornecedor_ativo_idx" ON "Fornecedor"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_referencia_key" ON "Produto"("referencia");

-- CreateIndex
CREATE INDEX "Produto_ativo_idx" ON "Produto"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFornecedor_produtoId_fornecedorId_key" ON "ProdutoFornecedor"("produtoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "CotacaoEnvioItem_produtoId_idx" ON "CotacaoEnvioItem"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoEnvioFornecedor_cotacaoEnvioId_fornecedorId_key" ON "CotacaoEnvioFornecedor"("cotacaoEnvioId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoResposta_cotacaoEnvioId_fornecedorId_key" ON "CotacaoResposta"("cotacaoEnvioId", "fornecedorId");

-- CreateIndex
CREATE INDEX "CotacaoRespostaItem_produtoId_idx" ON "CotacaoRespostaItem"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_cotacaoEnvioId_key" ON "Compra"("cotacaoEnvioId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompra_compraId_fornecedorId_key" ON "PedidoCompra"("compraId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompraItem_selecaoCompraItemId_key" ON "PedidoCompraItem"("selecaoCompraItemId");

-- CreateIndex
CREATE INDEX "NotaFiscal_pedidoCompraId_idx" ON "NotaFiscal"("pedidoCompraId");

-- CreateIndex
CREATE INDEX "HistoricoStatus_entidadeTipo_entidadeId_idx" ON "HistoricoStatus"("entidadeTipo", "entidadeId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aplicacao" ADD CONSTRAINT "Aplicacao_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvio" ADD CONSTRAINT "CotacaoEnvio_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvio" ADD CONSTRAINT "CotacaoEnvio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvioItem" ADD CONSTRAINT "CotacaoEnvioItem_cotacaoEnvioId_fkey" FOREIGN KEY ("cotacaoEnvioId") REFERENCES "CotacaoEnvio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvioItem" ADD CONSTRAINT "CotacaoEnvioItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvioItem" ADD CONSTRAINT "CotacaoEnvioItem_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "Aplicacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvioFornecedor" ADD CONSTRAINT "CotacaoEnvioFornecedor_cotacaoEnvioId_fkey" FOREIGN KEY ("cotacaoEnvioId") REFERENCES "CotacaoEnvio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoEnvioFornecedor" ADD CONSTRAINT "CotacaoEnvioFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoResposta" ADD CONSTRAINT "CotacaoResposta_cotacaoEnvioId_fkey" FOREIGN KEY ("cotacaoEnvioId") REFERENCES "CotacaoEnvio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoResposta" ADD CONSTRAINT "CotacaoResposta_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoResposta" ADD CONSTRAINT "CotacaoResposta_usuarioPreenchimentoId_fkey" FOREIGN KEY ("usuarioPreenchimentoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoRespostaItem" ADD CONSTRAINT "CotacaoRespostaItem_cotacaoRespostaId_fkey" FOREIGN KEY ("cotacaoRespostaId") REFERENCES "CotacaoResposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoRespostaItem" ADD CONSTRAINT "CotacaoRespostaItem_cotacaoEnvioItemId_fkey" FOREIGN KEY ("cotacaoEnvioItemId") REFERENCES "CotacaoEnvioItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoRespostaItem" ADD CONSTRAINT "CotacaoRespostaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_cotacaoEnvioId_fkey" FOREIGN KEY ("cotacaoEnvioId") REFERENCES "CotacaoEnvio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelecaoCompraItem" ADD CONSTRAINT "SelecaoCompraItem_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelecaoCompraItem" ADD CONSTRAINT "SelecaoCompraItem_cotacaoRespostaItemId_fkey" FOREIGN KEY ("cotacaoRespostaItemId") REFERENCES "CotacaoRespostaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelecaoCompraItem" ADD CONSTRAINT "SelecaoCompraItem_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_selecaoCompraItemId_fkey" FOREIGN KEY ("selecaoCompraItemId") REFERENCES "SelecaoCompraItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoItem" ADD CONSTRAINT "RecebimentoItem_pedidoCompraItemId_fkey" FOREIGN KEY ("pedidoCompraItemId") REFERENCES "PedidoCompraItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoItem" ADD CONSTRAINT "RecebimentoItem_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_cotacaoEnvioId_fkey" FOREIGN KEY ("cotacaoEnvioId") REFERENCES "CotacaoEnvio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoStatus" ADD CONSTRAINT "HistoricoStatus_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoEnvioMensagem" ADD CONSTRAINT "HistoricoEnvioMensagem_cotacaoEnvioFornecedorId_fkey" FOREIGN KEY ("cotacaoEnvioFornecedorId") REFERENCES "CotacaoEnvioFornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
