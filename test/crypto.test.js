import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { decrypt, encrypt, fingerprint, generateKey, parseKey, verifyMetaSignature } from '../src/crypto.js';

const key = parseKey(generateKey());

test('cifra y descifra', () => {
  const ct = encrypt('hola bowa ✅', key);
  assert.notEqual(ct, 'hola bowa ✅');
  assert.equal(decrypt(ct, key), 'hola bowa ✅');
});

test('detecta manipulación', () => {
  const [v, iv, tag, ct] = encrypt('secreto', key).split(':');
  const tampered = [v, iv, tag, ct.slice(0, -2) + (ct.endsWith('A') ? 'BB' : 'AA')].join(':');
  assert.throws(() => decrypt(tampered, key));
});

test('rechaza llaves de tamaño incorrecto', () => {
  assert.throws(() => parseKey('corta'));
});

test('huella determinística', () => {
  assert.equal(fingerprint('573001234567', key), fingerprint('573001234567', key));
  assert.notEqual(fingerprint('573001234567', key), fingerprint('573001234568', key));
});

test('verifica firma de Meta', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.ok(verifyMetaSignature(body, sig, 's3cret'));
  assert.ok(!verifyMetaSignature(body, sig, 'otro'));
  assert.ok(!verifyMetaSignature(body, undefined, 's3cret'));
});
