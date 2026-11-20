import { prisma } from "../prisma/lib/prisma.ts";
import { WhatsAppProvider } from "./whatsapp.service.js";

const provider = new WhatsAppProvider();
const RETRY_LIMIT = 3;

async function processNotification(id, { force = false } = {}) {
  const row = await prisma.notificacao.findUnique({ where: { id } });
  if (!row || !["PENDENTE", "FALHOU"].includes(row.status) || row.tentativas >= RETRY_LIMIT) return row;
  if (!force && row.proximaTentativa && row.proximaTentativa > new Date()) return row;
  if (!row.telefone) return prisma.notificacao.update({ where: { id }, data: { status: "SEM_DESTINATARIO", erro: "Nenhum destinatario configurado para este usuario." } });
  const claim = await prisma.notificacao.updateMany({ where: { id, status: row.status, tentativas: row.tentativas }, data: { status: "ENVIANDO" } });
  if (!claim.count) return prisma.notificacao.findUnique({ where: { id } });
  const attempt = row.tentativas + 1;
  try {
    await provider.enviar({ telefone: row.telefone, mensagem: row.mensagem, usuarioId: row.usuarioId });
    return prisma.notificacao.update({ where: { id }, data: { status: "ENVIADA", tentativas: attempt, enviadoEm: new Date(), erro: null, proximaTentativa: null } });
  } catch (error) {
    const exhausted = attempt >= RETRY_LIMIT;
    return prisma.notificacao.update({ where: { id }, data: {
      status: exhausted ? "FALHOU" : "PENDENTE",
      tentativas: attempt,
      erro: String(error.message || "Falha no envio").slice(0, 1500),
      proximaTentativa: exhausted ? null : new Date(Date.now() + attempt * 60_000),
    } });
  }
}

export async function notificarUsuario({ usuarioId, evento, entidadeTipo, entidadeId, chaveIdempotencia, mensagem }) {
  if (!usuarioId || !chaveIdempotencia) return [];
  const recipients = await prisma.whatsAppDestinatario.findMany({ where: { usuarioId, ativo: true }, orderBy: { id: "asc" } });
  const targets = recipients.length ? recipients : [{ id: 0, nome: null, identificador: null }];
  const created = [];
  for (const recipient of targets) {
    const key = `${chaveIdempotencia}:${recipient.id || "sem-destinatario"}`;
    const row = await prisma.notificacao.upsert({
      where: { chaveIdempotencia: key },
      update: {},
      create: { usuarioId, evento, entidadeTipo, entidadeId: String(entidadeId), chaveIdempotencia: key, destinatarioNome: recipient.nome, telefone: recipient.identificador, mensagem },
    });
    created.push(await processNotification(row.id));
  }
  return created;
}

export async function processarNotificacoesPendentes(limit = 50) {
  const rows = await prisma.notificacao.findMany({ where: { status: "PENDENTE", OR: [{ proximaTentativa: null }, { proximaTentativa: { lte: new Date() } }], tentativas: { lt: RETRY_LIMIT } }, orderBy: { criadoEm: "asc" }, take: limit, select: { id: true } });
  for (const row of rows) await processNotification(row.id);
  return rows.length;
}

export async function verificarAlertasEntrega() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const items = await prisma.pedidoCompraItem.findMany({ where: { statusEntrega: { in: ["PENDENTE", "PARCIALMENTE_ENTREGUE", "ATRASADA"] }, dataPrevistaEntrega: { lte: tomorrow }, pedido: { status: { not: "CANCELADO" }, compra: { status: { not: "CANCELADA" } } } }, include: { selecao: { include: { oferta: { include: { produto: true } } } }, pedido: { include: { compra: { include: { obra: true } } } } }, take: 500 });
  for (const item of items) {
    const compra = item.pedido.compra;
    const usuarioId = compra.solicitanteId;
    if (!usuarioId) continue;
    const atrasada = item.dataPrevistaEntrega < now;
    const data = item.dataPrevistaEntrega.toISOString().slice(0, 10);
    const evento = atrasada ? "ENTREGA_ATRASADA" : "ENTREGA_PROXIMA";
    const produto = item.selecao.oferta.produto.nome;
    await notificarUsuario({ usuarioId, evento, entidadeTipo: "PedidoCompraItem", entidadeId: item.id, chaveIdempotencia: `entrega:${evento}:${item.id}:${data}`, mensagem: `${atrasada ? "Entrega atrasada" : "Entrega proxima do prazo"}: ${produto}, obra ${compra.obra.nome}, compra #${compra.id}. Previsao: ${data}.` }).catch(() => {});
  }
  return items.length;
}

export async function tentarNovamenteNotificacao(id) {
  const row = await prisma.notificacao.findUniqueOrThrow({ where: { id: BigInt(id) } });
  if (!["PENDENTE", "FALHOU"].includes(row.status)) throw new Error("Esta notificacao nao esta disponivel para nova tentativa.");
  if (row.tentativas >= RETRY_LIMIT) throw new Error("O limite automatico de tentativas foi atingido.");
  return processNotification(row.id, { force: true });
}
