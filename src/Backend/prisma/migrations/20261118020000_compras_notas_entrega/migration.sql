ALTER TABLE "Compra" ADD COLUMN "solicitanteId" INTEGER;
ALTER TABLE "Compra" ADD COLUMN "aprovadorId" INTEGER;
ALTER TABLE "Compra" ADD COLUMN "canceladaPorId" INTEGER;
ALTER TABLE "Compra" ADD COLUMN "aprovadaEm" TIMESTAMP(3);
ALTER TABLE "Compra" ADD COLUMN "canceladaEm" TIMESTAMP(3);
ALTER TABLE "Compra" ADD COLUMN "valorAprovado" DECIMAL(14,2);
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotaFiscal" ADD COLUMN "compraId" INTEGER;
ALTER TABLE "NotaFiscal" ADD COLUMN "chaveAcesso" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "dataRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NotaFiscal" ADD COLUMN "ativa" BOOLEAN NOT NULL DEFAULT true;
UPDATE "NotaFiscal" n SET "compraId" = p."compraId" FROM "PedidoCompra" p WHERE p."id" = n."pedidoCompraId";
WITH ordenadas AS (
  SELECT n."id", ROW_NUMBER() OVER (PARTITION BY n."compraId" ORDER BY n."dataEmissao" DESC, n."id" DESC) AS posicao
  FROM "NotaFiscal" n
)
UPDATE "NotaFiscal" n SET "ativa" = false FROM ordenadas o WHERE o."id" = n."id" AND o.posicao > 1;
ALTER TABLE "NotaFiscal" ALTER COLUMN "compraId" SET NOT NULL;
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NotaFiscal_compraId_ativa_idx" ON "NotaFiscal"("compraId", "ativa");
CREATE UNIQUE INDEX "NotaFiscal_uma_ativa_por_compra_key" ON "NotaFiscal"("compraId") WHERE "ativa" = true;

CREATE TABLE "HistoricoNotaFiscal" (
  "id" SERIAL NOT NULL,
  "notaFiscalId" INTEGER NOT NULL,
  "compraId" INTEGER NOT NULL,
  "usuarioId" INTEGER,
  "numero" TEXT NOT NULL,
  "chaveAcesso" TEXT,
  "dataEmissao" TIMESTAMP(3) NOT NULL,
  "valorTotal" DECIMAL(12,2) NOT NULL,
  "arquivoReferencia" TEXT,
  "dataRegistro" TIMESTAMP(3) NOT NULL,
  "substituidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricoNotaFiscal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HistoricoNotaFiscal_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoNotaFiscal_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoNotaFiscal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "HistoricoNotaFiscal_compraId_substituidaEm_idx" ON "HistoricoNotaFiscal"("compraId", "substituidaEm");

CREATE TYPE "StatusEntrega" AS ENUM ('PENDENTE', 'PARCIALMENTE_ENTREGUE', 'ENTREGUE', 'ATRASADA', 'CANCELADA');
ALTER TABLE "PedidoCompraItem" ADD COLUMN "dataPrevistaEntrega" TIMESTAMP(3);
ALTER TABLE "PedidoCompraItem" ADD COLUMN "dataEntregaEfetiva" TIMESTAMP(3);
ALTER TABLE "PedidoCompraItem" ADD COLUMN "statusEntrega" "StatusEntrega" NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE "PedidoCompraItem" ADD COLUMN "observacaoEntrega" TEXT;

