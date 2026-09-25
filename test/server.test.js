import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateKey, parseKey } from '../src/crypto.js';
import { generateRadicado } from '../src/radicado.js';
import { replyFor } from '../src/server.js';
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
