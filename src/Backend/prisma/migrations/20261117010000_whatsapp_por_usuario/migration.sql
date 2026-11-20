ALTER TABLE "WhatsAppDestinatario" ADD COLUMN "usuarioId" INTEGER;
UPDATE "WhatsAppDestinatario"
SET "usuarioId" = (SELECT "id" FROM "Usuario" ORDER BY "ativo" DESC, "id" ASC LIMIT 1)
WHERE "usuarioId" IS NULL;
ALTER TABLE "WhatsAppDestinatario" ALTER COLUMN "usuarioId" SET NOT NULL;
DROP INDEX "WhatsAppDestinatario_identificador_key";
CREATE UNIQUE INDEX "WhatsAppDestinatario_usuarioId_identificador_key" ON "WhatsAppDestinatario"("usuarioId", "identificador");
CREATE INDEX "WhatsAppDestinatario_usuarioId_ativo_tipo_idx" ON "WhatsAppDestinatario"("usuarioId", "ativo", "tipo");
ALTER TABLE "WhatsAppDestinatario" ADD CONSTRAINT "WhatsAppDestinatario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;