CREATE TABLE "Notificacao" (
  "id" BIGSERIAL NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "evento" TEXT NOT NULL,
  "entidadeTipo" TEXT NOT NULL,
  "entidadeId" TEXT NOT NULL,
  "destinatarioNome" TEXT,
  "telefone" TEXT,
  "mensagem" TEXT NOT NULL,
  "chaveIdempotencia" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "erro" TEXT,
  "proximaTentativa" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadoEm" TIMESTAMP(3),
  CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Notificacao_chaveIdempotencia_key" ON "Notificacao"("chaveIdempotencia");
CREATE INDEX "Notificacao_usuarioId_criadoEm_idx" ON "Notificacao"("usuarioId", "criadoEm");
CREATE INDEX "Notificacao_status_proximaTentativa_idx" ON "Notificacao"("status", "proximaTentativa");
CREATE INDEX "Notificacao_entidadeTipo_entidadeId_idx" ON "Notificacao"("entidadeTipo", "entidadeId");
