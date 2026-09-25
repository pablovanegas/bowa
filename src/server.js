// Servidor de webhook de WhatsApp: verificación, recepción de mensajes y consulta de radicados.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig, requireKeys } from './config.js';
import { parseKey, verifyMetaSignature } from './crypto.js';
import { isValidRadicado, normalizeRadicado } from './radicado.js';
import { EncryptedStore } from './store.js';
import { WhatsAppClient } from './whatsapp.js';

const STOP_WORDS = new Set(['stop', 'baja', 'parar', 'cancelar', 'no mas', 'no más']);
const START_WORDS = new Set(['start', 'alta', 'suscribir']);

export function replyFor(text, from, store) {
  const clean = String(text ?? '').trim();
  const lower = clean.toLowerCase();

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
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], config.whatsapp.appSecret)) return send(401, 'bad signature');

    send(200, 'EVENT_RECEIVED'); // Meta exige responder rápido; procesamos después.

    try {
      const payload = JSON.parse(raw.toString('utf8'));
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value ?? {};
          for (const status of value.statuses ?? []) updateStatus(store, status);
          for (const msg of value.messages ?? []) {
            if (msg.type !== 'text') continue;
            const reply = replyFor(msg.text?.body, msg.from, store);
            await client.markRead(msg.id).catch(() => {});
            await client.sendText(msg.from, reply);
          }
        }
      }
      await store.save();
    } catch (err) {
      console.error('[bowa] error procesando webhook:', err.message);
    }
  });
}

function updateStatus(store, status) {
  // sent → delivered → read, o failed
  for (const info of Object.values(store.data.radicados)) {
    if (info.messageId === status.id) info.status = { sent: 'enviado', delivered: 'entregado', read: 'leído', failed: 'fallido' }[status.status] ?? status.status;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  requireKeys(config, ['whatsapp.token', 'whatsapp.phoneNumberId', 'whatsapp.verifyToken', 'whatsapp.appSecret', 'encryptionKey']);
  const store = await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load();
  const client = new WhatsAppClient(config.whatsapp);
  createApp({ config, store, client }).listen(config.port, () => console.log(`[bowa] webhook escuchando en :${config.port}/webhook`));
}
