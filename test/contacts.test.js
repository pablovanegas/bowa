import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhone, parseCsv, prepareContacts } from '../src/contacts.js';

test('normaliza teléfonos colombianos', () => {
  assert.equal(normalizePhone('300 123 4567'), '573001234567');
  assert.equal(normalizePhone('+57 (300) 123-4567'), '573001234567');
  assert.equal(normalizePhone('0015551234567'), '15551234567');
  assert.equal(normalizePhone('123'), null);
});

test('parsea CSV con comillas y punto y coma', () => {
  const rows = parseCsv('telefono;nombre;opt_in\r\n3001234567;"Pérez; Ana";si\n');
  assert.deepEqual(rows, [{ telefono: '3001234567', nombre: 'Pérez; Ana', opt_in: 'si' }]);
});

test('filtra sin consentimiento, duplicados y bajas', () => {
  const { ready, skipped } = prepareContacts(
    [
      { telefono: '3001234567', opt_in: 'si' },
      { telefono: '3001234567', opt_in: 'sí' },
      { telefono: '3100000000', opt_in: 'no' },
      { telefono: '3200000000', opt_in: 'si' },
      { telefono: 'abc', opt_in: 'si' },
    ],
    { isOptedOut: (p) => p === '573200000000' },
  );
  assert.deepEqual(ready.map((c) => c.phone), ['573001234567']);
  assert.deepEqual(skipped.map((s) => s.reason).sort(), ['dado_de_baja', 'duplicado', 'sin_consentimiento', 'telefono_invalido']);
});
