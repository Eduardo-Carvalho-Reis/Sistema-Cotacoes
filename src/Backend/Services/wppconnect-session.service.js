import crypto from "node:crypto";
import { prisma } from "../prisma/lib/prisma.ts";
import { sessionNameFor } from "./wppconnect-session.utils.js";

const baseUrl = () => String(process.env.WHATSAPP_SERVER_URL || "").replace(/\/+$/, "");
const configured = () => Boolean(baseUrl() && process.env.WHATSAPP_SERVER_SECRET_KEY && process.env.WPP_TOKEN_ENCRYPTION_KEY);
const encryptionKey = () => crypto.createHash("sha256").update(process.env.WPP_TOKEN_ENCRYPTION_KEY || "").digest();

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64")).join(".");
}

function decrypt(value) {
  const [ivText, tagText, ciphertextText] = String(value || "").split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Credencial de sessão inválida.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64")), decipher.final()]).toString("utf8");
}

function sessionUrl(session, path) {
  return `${baseUrl()}/api/${encodeURIComponent(session.nomeSessao)}/${path}`;
}

async function request(url, { method = "GET", token, body, timeoutMs = 15000 } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.startsWith("image/")
    ? { qrcode: `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}` }
    : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `WPPConnect respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function tokenFrom(payload) {
  if (typeof payload.token === "string") return payload.token;
  if (typeof payload.full === "string") return payload.full.split(":").at(-1);
  return null;
}

function bearerToken(value) {
  return typeof value === "string" ? value.split(":").at(-1) : null;
}

function qrFrom(payload) {
  const qr = payload.qrcode || payload.qrCode || payload.base64Qrimg || payload.urlCode || null;
  if (typeof qr !== "string") return null;
  return qr.startsWith("data:image/") ? qr : `data:image/png;base64,${qr}`;
}

function connectedFrom(payload) {
  const values = [payload.status, payload.statusSession, payload.state].filter(value => typeof value === "string").map(value => value.toLowerCase());
  return values.some(value => ["connected", "islogged", "logged", "ready", "qrreadsuccess"].includes(value));
}

export class WppConnectSessionService {
  isConfigured() { return configured(); }

  async getSession(userId) {
    return prisma.whatsAppSessao.findUnique({ where: { usuarioId: Number(userId) } });
  }

  async ensureSession(userId) {
    if (!configured()) {
      const error = new Error("Configure WHATSAPP_SERVER_URL, WHATSAPP_SERVER_SECRET_KEY e WPP_TOKEN_ENCRYPTION_KEY no ambiente do backend.");
      error.status = 503;
      throw error;
    }
    return prisma.whatsAppSessao.upsert({
      where: { usuarioId: Number(userId) },
      update: {},
      create: { usuarioId: Number(userId), nomeSessao: sessionNameFor(userId), status: "DESCONECTADO" },
    });
  }

  async tokenFor(session) {
    if (session.tokenCriptografado) {
      const storedToken = decrypt(session.tokenCriptografado);
      const token = bearerToken(storedToken);
      if (token && token !== storedToken) {
        await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { tokenCriptografado: encrypt(token) } });
      }
      return token;
    }
    const payload = await request(`${baseUrl()}/api/${encodeURIComponent(session.nomeSessao)}/${encodeURIComponent(process.env.WHATSAPP_SERVER_SECRET_KEY)}/generate-token`, { method: "POST" });
    const token = tokenFrom(payload);
    if (!token) throw new Error("WPPConnect não retornou o token de sessão esperado.");
    const updated = await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { tokenCriptografado: encrypt(token) } });
    return decrypt(updated.tokenCriptografado);
  }

  async getStatus(session, token) {
    const payload = await request(sessionUrl(session, "status-session"), { token });
    const connected = connectedFrom(payload);
    const status = connected ? "CONECTADO" : qrFrom(payload) ? "AGUARDANDO_QR" : "DESCONECTADO";
    await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { status, atualizadoStatusEm: new Date() } });
    return { status, conectado: connected, qrCode: qrFrom(payload) };
  }

  async connect(userId, { restart = false } = {}) {
    const session = await this.ensureSession(userId);
    const token = await this.tokenFor(session);
    if (restart) await request(sessionUrl(session, "close-session"), { method: "POST", token }).catch(() => {});
    const started = await request(sessionUrl(session, "start-session"), { method: "POST", token, body: { waitQrCode: true }, timeoutMs: 300000 });
    let qrPayload = started;
    if (!qrFrom(qrPayload)) {
      try { qrPayload = await request(sessionUrl(session, "qrcode-session"), { token }); }
      catch (error) { if (error.status !== 500) throw error; }
    }
    const status = await this.getStatus(session, token).catch(() => ({ status: "AGUARDANDO_QR", conectado: false }));
    const qrCode = qrFrom(qrPayload) || status.qrCode;
    const finalStatus = status.conectado ? "CONECTADO" : qrCode ? "AGUARDANDO_QR" : status.status;
    await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { status: finalStatus, atualizadoStatusEm: new Date() } });
    return { configurado: true, status: finalStatus, conectado: status.conectado, qrCode };
  }

  async status(userId) {
    const session = await this.getSession(userId);
    if (!session) return { configurado: configured(), status: "NAO_CONECTADO", conectado: false, qrCode: null };
    if (!configured()) return { configurado: false, status: session.status, conectado: false, qrCode: null };
    try {
      const token = await this.tokenFor(session);
      const status = await this.getStatus(session, token);
      let qrCode = status.qrCode;
      if (!status.conectado && !qrCode) {
        try { qrCode = qrFrom(await request(sessionUrl(session, "qrcode-session"), { token })) || qrCode; }
        catch { /* A sessão pode ainda não ter QR. */ }
      }
      return { configurado: true, ...status, qrCode };
    } catch (error) {
      if (error.status === 401) await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { tokenCriptografado: null, status: "EXPIRADA", atualizadoStatusEm: new Date() } });
      throw error;
    }
  }

  async disconnect(userId) {
    const session = await this.ensureSession(userId);
    if (!session.tokenCriptografado) {
      await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { status: "DESCONECTADO", telefoneConectado: null, atualizadoStatusEm: new Date() } });
      return { configurado: true, status: "DESCONECTADO", conectado: false, qrCode: null };
    }
    const token = decrypt(session.tokenCriptografado);
    // close-session only shuts down Chromium and preserves the linked WhatsApp
    // account. logout-session unlinks it and clears WPPConnect's saved session,
    // so the next start-session produces a fresh QR code.
    try {
      await request(sessionUrl(session, "logout-session"), { method: "POST", token });
    } catch (error) {
      const clearUrl = `${baseUrl()}/api/${encodeURIComponent(session.nomeSessao)}/${encodeURIComponent(process.env.WHATSAPP_SERVER_SECRET_KEY)}/clear-session-data`;
      if (error.status !== 401) {
        // Some WPPConnect versions navigate away during logout, then report a
        // Puppeteer "Execution context was destroyed" error. Close the browser
        // first so the admin cleanup can safely remove this session's profile.
        await request(sessionUrl(session, "close-session"), { method: "POST", token }).catch(() => {});
      }
      await request(clearUrl, { method: "POST" });
    }
    await prisma.whatsAppSessao.update({ where: { id: session.id }, data: { tokenCriptografado: null, status: "DESCONECTADO", telefoneConectado: null, atualizadoStatusEm: new Date() } });
    return { configurado: true, status: "DESCONECTADO", conectado: false, qrCode: null };
  }

  async enviar(userId, { telefone, mensagem }) {
    const session = await this.getSession(userId);
    if (!session?.tokenCriptografado) return null;
    const token = decrypt(session.tokenCriptografado);
    const rawTarget = String(telefone || "").trim();
    const phone = rawTarget.includes("@g.us") ? rawTarget : rawTarget.replace(/\D/g, "");
    if (!phone) throw new Error("O destinatário não tem um telefone ou ID de grupo válido.");
    const payload = await request(sessionUrl(session, "send-message"), { method: "POST", token, body: { phone: [phone], message: mensagem } });
    const id = payload.id;
    return { identificadorExterno: (typeof id === "string" ? id : id?._serialized) || payload.messageId || payload.response?.id || null };
  }
}

export const wppConnectSessions = new WppConnectSessionService();
