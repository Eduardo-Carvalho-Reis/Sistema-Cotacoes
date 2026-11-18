ALTER TABLE "HistoricoEnvioMensagem" ADD COLUMN "usuarioId" INTEGER;
ALTER TABLE "HistoricoEnvioMensagem" ADD CONSTRAINT "HistoricoEnvioMensagem_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
