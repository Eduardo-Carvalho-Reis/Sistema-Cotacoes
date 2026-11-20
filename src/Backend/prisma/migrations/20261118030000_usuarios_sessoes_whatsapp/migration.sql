CREATE TABLE "WhatsAppSessao" (
  "id" SERIAL NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "nomeSessao" TEXT NOT NULL,
  "tokenCriptografado" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DESCONECTADO',
  "telefoneConectado" TEXT,
  "atualizadoStatusEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppSessao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppSessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsAppSessao_usuarioId_key" ON "WhatsAppSessao"("usuarioId");
CREATE UNIQUE INDEX "WhatsAppSessao_nomeSessao_key" ON "WhatsAppSessao"("nomeSessao");
