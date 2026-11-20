import { Router } from "express";
import { prisma } from "../prisma/lib/prisma.ts";
import { wppConnectSessions } from "../Services/wppconnect-session.service.js";

const router = Router();
const sessionError = (res, error) => {
  const status = error.status === 401 ? 502 : error.status || (error.code === "P2025" ? 404 : 502);
  return res.status(status).json({ erro: error.message || "Falha na integração com WhatsApp." });
};

router.get("/sessao", async (req, res) => {
  try { res.json(await wppConnectSessions.status(req.usuario.id)); }
  catch (error) { sessionError(res, error); }
});

router.post("/sessao/conectar", async (req, res) => {
  // WPPConnect may already be starting this session during server boot. Do not
  // close its Chromium client just to request the QR; that teardown + relaunch
  // adds a full browser startup to every first connection attempt.
  try { res.json(await wppConnectSessions.connect(req.usuario.id)); }
  catch (error) { sessionError(res, error); }
});

router.post("/sessao/reiniciar", async (req, res) => {
  try { res.json(await wppConnectSessions.connect(req.usuario.id, { restart: true })); }
  catch (error) { sessionError(res, error); }
});

router.post("/sessao/desconectar", async (req, res) => {
  try { res.json(await wppConnectSessions.disconnect(req.usuario.id)); }
  catch (error) { sessionError(res, error); }
});
const fail = (res, error) => res.status(error.code === "P2025" ? 404 : error.code === "P2002" ? 409 : 400).json({ erro: error.message });
const normalize = (body, partial = false) => {
  const data = {};
  if (!partial || body.nome !== undefined) data.nome = String(body.nome || "").trim();
  if (!partial || body.tipo !== undefined) data.tipo = String(body.tipo || "").trim().toUpperCase();
  if (!partial || body.identificador !== undefined) {
    const tipo = data.tipo || String(body.tipo || "").trim().toUpperCase();
    const raw = String(body.identificador || "").trim();
    data.identificador = tipo === "NUMERO" ? raw.replace(/\D/g, "") : raw;
  }
  if (!partial && (!data.nome || !data.identificador || !["NUMERO", "GRUPO"].includes(data.tipo))) throw new Error("Informe nome, identificador e tipo (número ou grupo).");
  if (partial && data.tipo && !["NUMERO", "GRUPO"].includes(data.tipo)) throw new Error("Tipo inválido.");
  if (data.identificador !== undefined && !data.identificador) throw new Error("Informe um número de WhatsApp ou ID do grupo.");
  if (data.tipo === "NUMERO" && data.identificador && data.identificador.length < 10) throw new Error("Informe o telefone com DDD e código do país.");
  if (data.tipo === "GRUPO" && data.identificador && !data.identificador.includes("@g.us")) throw new Error("Informe o ID do grupo do WhatsApp, normalmente terminado em @g.us.");
  if (data.nome === "") throw new Error("Informe um nome para o destinatário.");
  return data;
};

router.get("/destinatarios", async (req, res) => {
  try {
    const destinatarios = await prisma.whatsAppDestinatario.findMany({ where: { usuarioId: req.usuario.id }, orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
    res.json({ destinatarios, provedorConfigurado: Boolean(process.env.WHATSAPP_PROVIDER_URL) });
  } catch (error) { fail(res, error); }
});

router.post("/destinatarios", async (req, res) => {
  try { res.status(201).json(await prisma.whatsAppDestinatario.create({ data: { ...normalize(req.body), usuarioId: req.usuario.id } })); }
  catch (error) { fail(res, error); }
});

router.patch("/destinatarios/:id", async (req, res) => {
  try {
    const where = { id: Number(req.params.id), usuarioId: req.usuario.id };
    await prisma.whatsAppDestinatario.findFirstOrThrow({ where });
    res.json(await prisma.whatsAppDestinatario.update({ where: { id: where.id }, data: normalize(req.body, true) }));
  }
  catch (error) { fail(res, error); }
});

router.delete("/destinatarios/:id", async (req, res) => {
  try {
    const where = { id: Number(req.params.id), usuarioId: req.usuario.id };
    await prisma.whatsAppDestinatario.findFirstOrThrow({ where });
    await prisma.whatsAppDestinatario.delete({ where: { id: where.id } });
    res.status(204).send();
  }
  catch (error) { fail(res, error); }
});

export default router;
