import { prisma } from "../prisma/lib/prisma.ts";

export async function registrarAuditoria(tx, {
  usuarioId,
  operacao,
  entidadeTipo,
  entidadeId,
  valoresAntes,
  valoresNovos,
  detalhes,
  cotacaoEnvioId,
  compraId,
  pedidoCompraId,
}) {
  const client = tx || prisma;
  return client.auditoria.create({
    data: {
      usuarioId: usuarioId || null,
      operacao,
      entidadeTipo,
      entidadeId: String(entidadeId),
      valoresAntes: valoresAntes === undefined ? undefined : JSON.parse(JSON.stringify(valoresAntes)),
      valoresNovos: valoresNovos === undefined ? undefined : JSON.parse(JSON.stringify(valoresNovos)),
      detalhes,
      cotacaoEnvioId,
      compraId,
      pedidoCompraId,
    },
  });
}
