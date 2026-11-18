CREATE TABLE "WhatsAppDestinatario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppDestinatario_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppDestinatario_identificador_key" ON "WhatsAppDestinatario"("identificador");
CREATE INDEX "WhatsAppDestinatario_ativo_tipo_idx" ON "WhatsAppDestinatario"("ativo", "tipo");