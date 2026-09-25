// Cliente mínimo de la API oficial de WhatsApp Cloud (Meta). Usa fetch nativo de Node.

export class WhatsAppError extends Error {
  constructor(message, { status, code, retryable } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export class WhatsAppClient {
  constructor({ token, phoneNumberId, apiVersion = 'v21.0', fetchImpl = globalThis.fetch }) {
    this.url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async send(payload) {
    const res = await this.fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body.error ?? {};
      throw new WhatsAppError(err.message || `HTTP ${res.status}`, {
        status: res.status,
        code: err.code,
        retryable: res.status === 429 || res.status >= 500 || err.code === 130429 || err.code === 131048,
      });
    }
    return { id: body.messages?.[0]?.id, raw: body };
  }

  // Mensajes iniciados por el negocio (envíos masivos) DEBEN usar una plantilla aprobada por Meta.
  sendTemplate(to, { name, language = 'es', bodyParams = [] }) {
    const components = bodyParams.length
      ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })) }]
      : undefined;
    return this.send({ to, type: 'template', template: { name, language: { code: language }, components } });
  }

  // Texto libre: solo dentro de la ventana de 24 h tras un mensaje del usuario.
  sendText(to, body) {
    return this.send({ to, type: 'text', text: { preview_url: false, body } });
  }

  markRead(messageId) {
    return this.send({ status: 'read', message_id: messageId });
  }
}
