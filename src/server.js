// Servidor de webhook de WhatsApp: verificación, recepción de mensajes y consulta de radicados.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig, requireKeys } from './config.js';
import { parseKey, verifyMetaSignature } from './crypto.js';
import { isValidRadicado, normalizeRadicado } from './radicado.js';
import { EncryptedStore } from './store.js';
import { WhatsAppClient } from './whatsapp.js';

const STOP_WORDS = new Set(['stop', 'baja', 'parar', 'cancelar', 'no mas', 'darme de baja']);
const START_WORDS = new Set(['start', 'alta', 'suscribir']);
const MAX_BODY = 1024 * 1024; // Meta envía lotes pequeños; más de 1 MB no es legítimo.
const STATUS_ES = { sent: 'enviado', delivered: 'entregado', read: 'leído', failed: 'fallido' };

// "BAJA.", "Baja!!", "no más" → "baja", "no mas": la baja debe funcionar como la escriba la persona.
export function normalizeCommand(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function replyFor(text, from, store) {
  const clean = String(text ?? '').trim();
  const lower = normalizeCommand(clean);

  if (STOP_WORDS.has(lower)) {
    store.setOptOut(from, true);
    return 'Listo. No recibirás más mensajes de bowa. Escribe ALTA para volver a suscribirte.';
  }
  if (START_WORDS.has(lower)) {
    store.setOptOut(from, false);
    return 'Suscripción reactivada. ✅';
  }

  const candidate = clean.split(/\s+/).find((w) => w.includes('-'));
  if (candidate) {
    if (!isValidRadicado(candidate)) return 'Ese radicado no es válido. Revisa que esté completo, p. ej. BOWA-20260925-7K3QMZ-Z.';
    const info = store.getRadicado(normalizeRadicado(candidate));
    if (!info || info.phone !== from) return 'No encontramos ese radicado asociado a este número.';
    return `Radicado ${normalizeRadicado(candidate)}\nEstado: ${info.status}\nFecha: ${info.createdAt.slice(0, 10)}`;
  }

  return 'Hola, soy bowa. Envía tu número de radicado para consultarlo, o BAJA para no recibir más mensajes.';
}

export function createApp({ config, store, client }) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body = '', type = 'text/plain') => { res.writeHead(status, { 'Content-Type': type }); res.end(body); };

    if (url.pathname === '/health') return send(200, JSON.stringify({ ok: true, name: 'bowa' }), 'application/json');

    if (url.pathname !== '/webhook') return send(404, 'not found');

    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === config.whatsapp.verifyToken;
      return ok ? send(200, url.searchParams.get('hub.challenge') ?? '') : send(403, 'forbidden');
    }

    if (req.method !== 'POST') return send(405, 'method not allowed');

    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) { send(413, 'payload too large'); req.destroy(); return; }
      chunks.push(c);
    }
    const raw = Buffer.concat(chunks);
    if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], config.whatsapp.appSecret)) return send(401, 'bad signature');

    send(200, 'EVENT_RECEIVED'); // Meta exige responder rápido; procesamos después.

    try {
      await processWebhook(JSON.parse(raw.toString('utf8')), { store, client });
    } catch (err) {
      console.error('[bowa] error procesando webhook:', err.message);
    }
  });
}

// Primero registra y guarda (bajas, estados); después responde. Así una respuesta que
// falla nunca deja una BAJA sin guardar.
export async function processWebhook(payload, { store, client }) {
  await store.refresh(); // radicados que la CLI guardó mientras el servidor corría
  const replies = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const st of value.statuses ?? []) {
        const at = st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : undefined;
        store.updateMessageStatus(st.id, STATUS_ES[st.status] ?? st.status, at);
      }
      for (const msg of value.messages ?? []) {
        if (msg.type !== 'text') continue;
        replies.push({ to: msg.from, id: msg.id, body: replyFor(msg.text?.body, msg.from, store) });
      }
    }
  }
  await store.save();

  for (const r of replies) {
    try {
      await client.markRead(r.id).catch(() => {});
      await client.sendText(r.to, r.body);
    } catch (err) {
      console.error('[bowa] no se pudo responder un mensaje:', err.message);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  requireKeys(config, ['whatsapp.token', 'whatsapp.phoneNumberId', 'whatsapp.verifyToken', 'whatsapp.appSecret', 'encryptionKey']);
  const store = await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load();
  const client = new WhatsAppClient(config.whatsapp);
  createApp({ config, store, client }).listen(config.port, config.host, () => console.log(`[bowa] webhook escuchando en ${config.host ?? '*'}:${config.port}/webhook`));
}
