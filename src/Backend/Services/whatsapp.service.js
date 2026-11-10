export class WhatsAppProvider {
  async enviar({ telefone, mensagem, idempotencia }) {
    const url = process.env.WHATSAPP_PROVIDER_URL;
    if (!url) throw new Error("Provedor WhatsApp não configurado.");
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WHATSAPP_PROVIDER_TOKEN || ""}`, "idempotency-key": idempotencia }, body: JSON.stringify({ telefone, mensagem }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Falha do provedor (${response.status}).`);
    return { identificadorExterno: payload.id || payload.messageId || null };
  }
}
