CREATE TYPE "StatusCotacaoEnvio_novo" AS ENUM ('RASCUNHO', 'ENVIADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ENCERRADA', 'CANCELADA');
ALTER TABLE "CotacaoEnvio" ADD COLUMN "status_novo" "StatusCotacaoEnvio_novo";
UPDATE "CotacaoEnvio" q SET "status_novo" = CASE
  WHEN q."status"::text = 'EM_ANALISE' THEN 'EM_ANDAMENTO'::"StatusCotacaoEnvio_novo"
  WHEN q."status"::text = 'APROVADA' AND EXISTS (
    SELECT 1 FROM "Compra" c WHERE c."cotacaoEnvioId" = q."id"
      AND EXISTS (SELECT 1 FROM "SelecaoCompraItem" s WHERE s."compraId" = c."id" AND s."status" = 'APROVADA')
  ) THEN 'CONCLUIDA'::"StatusCotacaoEnvio_novo"
  WHEN q."status"::text = 'APROVADA' THEN 'EM_ANDAMENTO'::"StatusCotacaoEnvio_novo"
  ELSE q."status"::text::"StatusCotacaoEnvio_novo"
END;
ALTER TABLE "CotacaoEnvio" ALTER COLUMN "status_novo" SET NOT NULL;
ALTER TABLE "CotacaoEnvio" DROP COLUMN "status";
ALTER TABLE "CotacaoEnvio" RENAME COLUMN "status_novo" TO "status";
DROP TYPE "StatusCotacaoEnvio";
ALTER TYPE "StatusCotacaoEnvio_novo" RENAME TO "StatusCotacaoEnvio";
ALTER TABLE "CotacaoEnvio" ALTER COLUMN "status" SET DEFAULT 'RASCUNHO';
ALTER TABLE "Usuario" ADD COLUMN "obraId" INTEGER;
CREATE INDEX "Usuario_obraId_idx" ON "Usuario"("obraId");
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Auditoria" (
  "id" BIGSERIAL NOT NULL,
  "usuarioId" INTEGER,
  "operacao" TEXT NOT NULL,
  "entidadeTipo" TEXT NOT NULL,
  "entidadeId" TEXT NOT NULL,
  "valoresAntes" JSONB,
  "valoresNovos" JSONB,
  "detalhes" JSONB,
  "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cotacaoEnvioId" INTEGER,
  "compraId" INTEGER,
  "pedidoCompraId" INTEGER,
  CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Auditoria_cotacaoEnvioId_fkey" FOREIGN KEY ("cotacaoEnvioId") REFERENCES "CotacaoEnvio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Auditoria_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Auditoria_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Auditoria_entidadeTipo_entidadeId_dataHora_idx" ON "Auditoria"("entidadeTipo", "entidadeId", "dataHora");
CREATE INDEX "Auditoria_usuarioId_dataHora_idx" ON "Auditoria"("usuarioId", "dataHora");


ALTER TABLE "CotacaoEnvio" ADD COLUMN "cancelamentoMotivo" TEXT;
ALTER TABLE "CotacaoEnvio" ADD COLUMN "canceladaEm" TIMESTAMP(3);
ALTER TABLE "CotacaoEnvio" ADD COLUMN "canceladaPorId" INTEGER;
ALTER TABLE "CotacaoEnvio" ADD CONSTRAINT "CotacaoEnvio_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HistoricoEnvioResposta" (
  "id" SERIAL NOT NULL,
  "cotacaoRespostaId" INTEGER NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "destinatarioId" INTEGER,
  "destinatarioNome" TEXT NOT NULL,
  "telefone" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "StatusEnvio" NOT NULL,
  "erro" TEXT,
  "identificadorExterno" TEXT,
  CONSTRAINT "HistoricoEnvioResposta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HistoricoEnvioResposta_cotacaoRespostaId_fkey" FOREIGN KEY ("cotacaoRespostaId") REFERENCES "CotacaoResposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HistoricoEnvioResposta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HistoricoEnvioResposta_cotacaoRespostaId_dataHora_idx" ON "HistoricoEnvioResposta"("cotacaoRespostaId", "dataHora");

INSERT INTO "Perfil" ("nome", "descricao") VALUES
  ('ADMINISTRADOR', 'Administração geral'),
  ('USUARIO_PADRAO', 'Acesso limitado à obra vinculada')
ON CONFLICT ("nome") DO NOTHING;
