import assert from 'node:assert/strict';
import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { encrypt, fingerprint, generateKey, parseKey } from '../src/crypto.js';
import { EncryptedStore, mergeData } from '../src/store.js';

async function par() {
  const path = join(await mkdtemp(join(tmpdir(), 'bowa-store-')), 'bowa.store');
  const key = parseKey(generateKey());
  // Dos procesos (servidor y CLI) que abrieron el mismo almacén.
  return [await new EncryptedStore(path, key).load(), await new EncryptedStore(path, key).load(), path, key];
}

test('dos procesos guardando no se borran los cambios', async () => {
  const [servidor, cli, path, key] = await par();
  servidor.setOptOut('573001234567');
  await servidor.save();
  cli.recordRadicado('BOWA-20260927-AAAAAA-0', { phone: '573109999999', status: 'enviado', messageId: 'wamid.1' });
  await cli.save(); // con la versión anterior, esto borraba la BAJA del servidor

  const fresco = await new EncryptedStore(path, key).load();
  assert.ok(fresco.isOptedOut('573001234567'));
  assert.ok(fresco.getRadicado('BOWA-20260927-AAAAAA-0'));
});

test('la decisión más reciente gana entre BAJA y ALTA', async () => {
  const [a, b, path, key] = await par();
  a.setOptOut('573001234567', true);
  await a.save();
  await new Promise((r) => setTimeout(r, 5));
  b.setOptOut('573001234567', false);
  await b.save();
  assert.ok(!(await new EncryptedStore(path, key).load()).isOptedOut('573001234567'));
});

test('un estado que llega antes que el radicado se enlaza al fusionar', async () => {
  const [servidor, cli, path, key] = await par();
  servidor.updateMessageStatus('wamid.X', 'entregado');
  await servidor.save();
  cli.recordRadicado('BOWA-20260927-BBBBBB-0', { phone: '57300', status: 'enviado', messageId: 'wamid.X' });
  await cli.save();
  assert.equal((await new EncryptedStore(path, key).load()).getRadicado('BOWA-20260927-BBBBBB-0').status, 'entregado');
});

test('los estados nunca retroceden', async () => {
  const [s] = await par();
  s.recordRadicado('R', { phone: '57300', status: 'enviado', messageId: 'w' });
  s.updateMessageStatus('w', 'leído', '2026-09-27T10:00:02Z');
  s.updateMessageStatus('w', 'entregado', '2026-09-27T10:00:01Z'); // llega tarde
  assert.equal(s.getRadicado('R').status, 'leído');
  s.updateMessageStatus('w', 'fallido');
  assert.equal(s.getRadicado('R').status, 'fallido');
});

test('un guardado fallido no bloquea los siguientes', async () => {
  const [s, , path] = await par();
  const archivo = path + '.bloqueo';
  await writeFile(archivo, 'x');
  s.path = join(archivo, 'no-se-puede.store'); // el padre es un archivo: falla
  await assert.rejects(s.save());
  s.path = path;
  s.setOptOut('573001234567');
  await s.save(); // antes: la cola quedaba rechazada para siempre
  assert.ok(await readFile(path, 'utf8'));
});

test('un candado huérfano se limpia solo', async () => {
  const [s, , path] = await par();
  await writeFile(`${path}.lock`, '');
  const viejo = new Date(Date.now() - 60_000);
  await utimes(`${path}.lock`, viejo, viejo);
  await s.save();
});

test('lee el formato viejo de bajas', async () => {
  const [, , path, key] = await par();
  const viejo = { radicados: {}, optOuts: { [fingerprint('573001234567', key)]: '2026-09-25T00:00:00Z' }, campaigns: [] };
  await writeFile(path, encrypt(JSON.stringify(viejo), key));
  assert.ok((await new EncryptedStore(path, key).load()).isOptedOut('573001234567'));
});

test('las campañas se unen sin duplicar', () => {
  const c1 = { id: 'a', at: '1', template: 't' };
  const c2 = { id: 'b', at: '2', template: 't' };
  assert.deepEqual(mergeData({ campaigns: [c1] }, { campaigns: [c1, c2] }).campaigns, [c1, c2]);
});
