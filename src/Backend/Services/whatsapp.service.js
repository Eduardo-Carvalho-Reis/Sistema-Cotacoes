import { wppConnectSessions } from "./wppconnect-session.service.js";

export class WhatsAppProvider {
  async enviar({ telefone, mensagem, usuarioId }) {
    if (usuarioId) {
      const sent = await wppConnectSessions.enviar(usuarioId, { telefone, mensagem });
      if (sent) return sent;
    }
    const url = process.env.WHATSAPP_PROVIDER_URL;
    if (!url) throw new Error("Provedor WhatsApp nao configurado.");

    const rawTarget = String(telefone || "").trim();
    const phone = rawTarget.includes("@g.us") ? rawTarget : rawTarget.replace(/\D/g, "");
    if (!phone) throw new Error("O destinatário não tem um telefone ou ID de grupo válido.");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.WHATSAPP_PROVIDER_TOKEN || ""}`,
      },
      body: JSON.stringify({ phone, message: mensagem }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `Falha do provedor (${response.status}).`);
    }

    const id = payload.id;
    return {
      identificadorExterno:
        (typeof id === "string" ? id : id?._serialized) || payload.messageId || payload.response?.id || null,
    };
  }
}
