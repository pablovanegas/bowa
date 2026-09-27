// Almacén local cifrado: todo el estado se guarda como un único blob AES-256-GCM.
// Lo usan a la vez el servidor (webhook) y la CLI (campañas): cada guardado toma un
// candado de archivo, relee lo que hay en disco y lo fusiona con lo que tiene en memoria,
// para que ningún proceso borre las bajas o estados que registró el otro.
// Suficiente para un MVP en una sola máquina; cambiar por una base de datos al escalar.
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { decrypt, encrypt, fingerprint } from './crypto.js';

// chat: conversación con cada persona (entrantes y salientes), para la bandeja.
const EMPTY = () => ({ radicados: {}, optOuts: {}, messages: {}, campaigns: [], chat: {} });

// Orden de los estados que llegan por webhook: nunca se retrocede (un "entregado"
// tardío no pisa un "leído"). "fallido" es final.
const STATUS_RANK = { enviado: 1, entregado: 2, leído: 3, fallido: 4 };

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// Formato viejo de optOuts: fingerprint → fecha (string). Nuevo: { out, at }.
function normalize(raw) {
  const data = { ...EMPTY(), ...raw };
  for (const [id, v] of Object.entries(data.optOuts)) {
    if (typeof v === 'string') data.optOuts[id] = { out: true, at: v };
  }
  return data;
}

const later = (a, b) => ((b ?? '') > (a ?? '') ? b : a);

function newerOf(a, b, stamp) {
  if (!a) return b;
  if (!b) return a;
  return (stamp(b) ?? '') > (stamp(a) ?? '') ? b : a;
}

function higherStatus(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ra = STATUS_RANK[a.status] ?? 0;
  const rb = STATUS_RANK[b.status] ?? 0;
  if (rb !== ra) return rb > ra ? b : a;
  return later(a.at, b.at) === b.at ? b : a;
}

function mergeMaps(a, b, pick) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = pick(a[k], v);
  return out;
}

const campaignKey = (c) => c.id ?? `${c.at}|${c.template}`;

// Un mensaje de chat no cambia; solo pasa de no leído a leído, nunca al revés.
function mergeChat(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { ...b, read: Boolean(a.read || b.read) };
}

// Fusiona dos copias del estado (disco y memoria) sin perder cambios de ninguna.
export function mergeData(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  const campaigns = new Map(x.campaigns.map((c) => [campaignKey(c), c]));
  for (const c of y.campaigns) campaigns.set(campaignKey(c), c);
  return {
    radicados: mergeMaps(x.radicados, y.radicados, (p, q) => newerOf(p, q, (r) => r.updatedAt ?? r.createdAt)),
    optOuts: mergeMaps(x.optOuts, y.optOuts, (p, q) => newerOf(p, q, (o) => o.at)),
    messages: mergeMaps(x.messages, y.messages, higherStatus),
    campaigns: [...campaigns.values()],
    chat: mergeMaps(x.chat, y.chat, mergeChat),
  };
}

export class EncryptedStore {
  constructor(path, key) {
    this.path = path;
    this.key = key;
    this.data = EMPTY();
    this.queue = Promise.resolve();
  }

  async readDisk() {
    try {
      return normalize(JSON.parse(decrypt(await readFile(this.path, 'utf8'), this.key)));
    } catch (err) {
      if (err.code === 'ENOENT') return EMPTY();
      throw new Error(`No se pudo abrir el almacén cifrado: ${err.message}`);
    }
  }

  async load() {
    this.data = await this.readDisk();
    return this;
  }

  // Trae lo que otros procesos guardaron, sin perder lo que hay en memoria.
  async refresh() {
    this.data = mergeData(await this.readDisk(), this.data);
    return this;
  }

  async withLock(fn) {
    await mkdir(dirname(this.path), { recursive: true });
    const lock = `${this.path}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        await (await open(lock, 'wx')).close();
        break;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (age > LOCK_STALE_MS) { await rm(lock, { force: true }); continue; } // candado huérfano
        if (Date.now() > deadline) throw new Error('El almacén está ocupado por otro proceso de bowa');
        await sleep(25);
      }
    }
    try {
      return await fn();
    } finally {
      await rm(lock, { force: true });
    }
  }

  save() {
    // Serializado dentro del proceso; entre procesos, candado + fusión con lo del disco.
    // El .catch evita que un guardado fallido bloquee todos los siguientes.
    const run = this.queue.catch(() => {}).then(() => this.withLock(async () => {
      this.data = mergeData(await this.readDisk(), this.data);
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, encrypt(JSON.stringify(this.data), this.key), { mode: 0o600 });
      await rename(tmp, this.path);
    }));
    this.queue = run;
    return run;
  }

  recordRadicado(radicado, info) {
    const at = now();
    this.data.radicados[radicado] = { ...info, createdAt: at, updatedAt: at };
  }

  // El estado vigente sale del último evento del webhook para su mensaje, si lo hay.
  getRadicado(radicado) {
    const info = this.data.radicados[radicado];
    if (!info) return null;
    const live = info.messageId && this.data.messages[info.messageId];
    return live ? { ...info, status: live.status } : info;
  }

  // Estado de un mensaje (wamid) reportado por el webhook. Se guarda aunque el radicado
  // todavía no esté en este proceso: se enlaza al fusionar.
  updateMessageStatus(messageId, status, at = now()) {
    this.data.messages[messageId] = higherStatus(this.data.messages[messageId], { status, at });
  }

  // Radicados de una campaña con su estado vigente.
  campaignRadicados(campaignId) {
    return Object.keys(this.data.radicados)
      .map((radicado) => ({ radicado, ...this.getRadicado(radicado) }))
      .filter((r) => r.campaignId === campaignId);
  }

  // Acepta el id completo o sus primeros caracteres (mínimo 6), como lo muestra la CLI.
  findCampaign(idOrPrefix) {
    const q = String(idOrPrefix ?? '').trim().toLowerCase();
    if (q.length < 6) throw new Error('Usa al menos 6 caracteres del id de la campaña');
    const hits = this.data.campaigns.filter((c) => c.id?.startsWith(q));
    if (hits.length > 1) throw new Error(`El id ${q} coincide con varias campañas; usa más caracteres`);
    return hits[0] ?? null;
  }

  // Guarda un mensaje de la conversación. dir: 'in' (lo escribió la persona) u 'out' (bowa o Juan).
  // Los salientes nacen leídos; los entrantes, sin leer.
  recordChat({ id, phone, dir, body, at = now(), auto = false }) {
    if (!id) return;
    const prev = this.data.chat[id];
    this.data.chat[id] = { phone, dir, body, at, auto, read: prev?.read ?? dir === 'out' };
  }

  chatWith(phone) {
    return Object.entries(this.data.chat)
      .filter(([, m]) => m.phone === phone)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  markChatRead(phone) {
    let n = 0;
    for (const m of Object.values(this.data.chat)) {
      if (m.phone === phone && !m.read) { m.read = true; n++; }
    }
    return n;
  }

  // Última vez que la persona escribió: abre la ventana de 24 h para texto libre.
  lastInboundAt(phone) {
    let last = null;
    for (const m of Object.values(this.data.chat)) {
      if (m.phone === phone && m.dir === 'in' && (!last || m.at > last)) last = m.at;
    }
    return last;
  }

  setOptOut(phone, optedOut = true) {
    this.data.optOuts[fingerprint(phone, this.key)] = { out: optedOut, at: now() };
  }

  isOptedOut(phone) {
    return this.data.optOuts[fingerprint(phone, this.key)]?.out === true;
  }
}
