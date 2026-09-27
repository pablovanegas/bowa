import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateKey, parseKey } from '../src/crypto.js';
import { generateRadicado } from '../src/radicado.js';
import { createApp, normalizeCommand, processWebhook, replyFor } from '../src/server.js';
import { EncryptedStore } from '../src/store.js';

async function newStore() {
  return new EncryptedStore(join(await mkdtemp(join(tmpdir(), 'bowa-')), 'bowa.store'), parseKey(generateKey()));
}

test('BAJA y ALTA gestionan la suscripción', async () => {
  const store = await newStore();
  replyFor('BAJA', '573001234567', store);
  assert.ok(store.isOptedOut('573001234567'));
  replyFor('alta', '573001234567', store);
  assert.ok(!store.isOptedOut('573001234567'));
});

test('consulta de radicado solo para su dueño', async () => {
  const store = await newStore();
  const rad = generateRadicado();
  store.recordRadicado(rad, { phone: '573001234567', status: 'entregado' });
  assert.match(replyFor(`mi radicado es ${rad.toLowerCase()}`, '573001234567', store), /entregado/);
  assert.match(replyFor(rad, '573109999999', store), /No encontramos/);
  assert.match(replyFor('BOWA-20260925-AAAAAA-Z', '573001234567', store), /no es válido|No encontramos/);
});

test('el almacén persiste cifrado', async () => {
  const store = await newStore();
  store.setOptOut('573001234567');
  await store.save();
  const again = await new EncryptedStore(store.path, store.key).load();
  assert.ok(again.isOptedOut('573001234567'));
  const { readFile } = await import('node:fs/promises');
  assert.ok(!(await readFile(store.path, 'utf8')).includes('optOuts'));
});

// ── Auditoría: webhook fiable ────────────────────────────────────────────────

const textoDe = (from, body) => ({ entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in', from, type: 'text', text: { body } }] } }] }] });

test('BAJA con puntuación, mayúsculas o tildes también cuenta', () => {
  for (const t of ['BAJA.', '¡Baja!', ' baja!! ', 'No más', 'STOP']) {
    assert.ok(['baja', 'no mas', 'stop'].includes(normalizeCommand(t)), t);
  }
});

test('la BAJA queda guardada aunque falle la respuesta', async () => {
  const store = await newStore();
  const client = { markRead: async () => {}, sendText: async () => { throw new Error('token vencido'); } };
  await processWebhook(textoDe('573001234567', 'BAJA'), { store, client });
  const fresco = await new EncryptedStore(store.path, store.key).load();
  assert.ok(fresco.isOptedOut('573001234567'));
});

test('los estados del webhook se aplican en orden aunque lleguen desordenados', async () => {
  const store = await newStore();
  store.recordRadicado('R', { phone: '573001234567', status: 'enviado', messageId: 'wamid.X' });
  const estados = { entry: [{ changes: [{ value: { statuses: [
    { id: 'wamid.X', status: 'read', timestamp: '1790500002' },
    { id: 'wamid.X', status: 'delivered', timestamp: '1790500001' },
  ] } }] }] };
  await processWebhook(estados, { store, client: {} });
  assert.equal(store.getRadicado('R').status, 'leído');
});

test('el webhook rechaza firmas malas y cuerpos gigantes', async () => {
  const store = await newStore();
  const config = { whatsapp: { verifyToken: 'v', appSecret: 's3cret' } };
  const server = createApp({ config, store, client: {} }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  try {
    const body = JSON.stringify(textoDe('573001234567', 'hola'));
    assert.equal((await fetch(url, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } })).status, 401);
    const firma = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
    assert.equal((await fetch(url, { method: 'POST', body, headers: { 'x-hub-signature-256': firma } })).status, 200);
    const grande = await fetch(url, { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024) }).catch((e) => e);
    assert.ok(grande.status === 413 || grande instanceof Error, 'debe cortar cuerpos de más de 1 MB');
  } finally {
    server.close();
  }
});
