export class WhatsAppProvider {
  async enviar({ telefone, mensagem }) {
    const url = process.env.WHATSAPP_PROVIDER_URL;
    if (!url) throw new Error("Provedor WhatsApp nao configurado.");

    const phone = String(telefone || "").replace(/\D/g, "");
    if (!phone) throw new Error("O fornecedor nao tem um telefone valido cadastrado.");

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
