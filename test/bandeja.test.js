// Fase 4: bandeja cifrada, ventana de 24 h y respuestas.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generateKey, parseKey } from '../src/crypto.js';
import { conversations, withinServiceWindow } from '../src/inbox.js';
import { processWebhook } from '../src/server.js';
import { EncryptedStore, mergeData } from '../src/store.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const TEL = '573001234567';

async function nuevo() {
  const dir = await mkdtemp(join(tmpdir(), 'bowa-bandeja-'));
  const keyB64 = generateKey();
  const store = new EncryptedStore(join(dir, 'bowa.store'), parseKey(keyB64));
  const env = { ...process.env, BOWA_ENCRYPTION_KEY: keyB64, BOWA_STORE_PATH: store.path, WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' };
  return { store, env };
}

const entrante = (id, body, segundos, type = 'text') => ({
  entry: [{ changes: [{ value: { messages: [{ id, from: TEL, timestamp: String(segundos), type, ...(type === 'text' ? { text: { body } } : {}) }] } }] }],
});

test('ventana de 24 h', () => {
  const ahora = new Date('2026-09-28T12:00:00Z');
  assert.ok(withinServiceWindow('2026-09-28T00:00:00Z', ahora));
  assert.ok(!withinServiceWindow('2026-09-27T11:59:00Z', ahora));
  assert.ok(!withinServiceWindow(null, ahora));
});

test('el webhook guarda entrantes (texto y multimedia) y la respuesta del bot', async () => {
  const { store } = await nuevo();
  const client = { markRead: async () => {}, sendText: async () => ({ id: 'wamid.bot' }) };
  const t = Math.floor(Date.now() / 1000);
  await processWebhook(entrante('wamid.1', 'hola, ¿mi radicado?', t), { store, client });
  await processWebhook(entrante('wamid.2', null, t + 1, 'image'), { store, client });

  const hilo = (await new EncryptedStore(store.path, store.key).load()).chatWith(TEL);
  assert.deepEqual(hilo.map((m) => [m.dir, m.body.slice(0, 5), m.read]), [
    ['in', 'hola,', false],
    ['out', 'Hola,', true],
    ['in', '[imag', false],
  ]);
  assert.ok(hilo[1].auto);
});

test('leído se conserva al fusionar entre procesos', () => {
  const m = { phone: TEL, dir: 'in', body: 'x', at: '2026-09-28T00:00:00Z' };
  const fusion = mergeData({ chat: { a: { ...m, read: true } } }, { chat: { a: { ...m, read: false } } });
  assert.equal(fusion.chat.a.read, true);
});

test('conversaciones: sin leer primero', () => {
  const chat = {
    a: { phone: '571', dir: 'in', body: 'viejo', at: '2026-09-28T01:00:00Z', read: false },
    b: { phone: '572', dir: 'in', body: 'nuevo', at: '2026-09-28T02:00:00Z', read: true },
  };
  assert.deepEqual(conversations(chat).map((c) => [c.phone, c.unread]), [['571', 1], ['572', 0]]);
});

test('CLI: bandeja lista, abre el hilo y lo marca leído', async () => {
  const { store, env } = await nuevo();
  store.recordChat({ id: 'w1', phone: TEL, dir: 'in', body: 'Buenas tardes' });
  await store.save();

  assert.match((await run('node', [CLI, 'bandeja'], { env })).stdout, /573001234567\s+🟢 1 sin leer.*Buenas tardes/);
  const hilo = await run('node', [CLI, 'bandeja', '3001234567'], { env });
  assert.match(hilo.stdout, /←\s+Buenas tardes/);
  assert.match(hilo.stdout, /bowa responder 573001234567/);
  assert.match((await run('node', [CLI, 'bandeja'], { env })).stdout, /al día/);
});

test('CLI: responder solo dentro de 24 h y nunca a quien se dio de baja', async () => {
  const { store, env } = await nuevo();
  store.recordChat({ id: 'viejo', phone: TEL, dir: 'in', body: 'hola', at: '2026-01-01T00:00:00Z' });
  await store.save();
  await assert.rejects(run('node', [CLI, 'responder', TEL, 'Claro que sí'], { env }), /24 h/);

  store.recordChat({ id: 'nuevo', phone: TEL, dir: 'in', body: 'hola otra vez' });
  await store.save();
  assert.match((await run('node', [CLI, 'responder', TEL, 'Claro que sí'], { env })).stdout, /\[simulado\] → 573001234567: Claro que sí/);

  store.setOptOut(TEL);
  await store.save();
  await assert.rejects(run('node', [CLI, 'responder', TEL, 'Claro que sí'], { env }), /BAJA/);
});
