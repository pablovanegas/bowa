import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateRadicado, isValidRadicado } from '../src/radicado.js';

test('formato y validez', () => {
  const r = generateRadicado({ prefix: 'BOWA', date: new Date('2026-09-25T15:00:00Z') });
  assert.match(r, /^BOWA-20260925-[0-9A-Z]{6}-[0-9A-Z]$/);
  assert.ok(isValidRadicado(r));
  assert.ok(isValidRadicado(r.toLowerCase()));
});

test('usa la zona horaria de Bogotá', () => {
  // 03:00 UTC del 26 = 22:00 del 25 en Bogotá
  assert.match(generateRadicado({ date: new Date('2026-09-26T03:00:00Z') }), /-20260925-/);
});

test('detecta errores de un carácter', () => {
  const r = generateRadicado();
  const i = r.length - 4; // un carácter del bloque aleatorio
  const swapped = r.slice(0, i) + (r[i] === '7' ? '8' : '7') + r.slice(i + 1);
  assert.ok(!isValidRadicado(swapped));
});

test('únicos en volumen', () => {
  const set = new Set(Array.from({ length: 5000 }, () => generateRadicado()));
  assert.equal(set.size, 5000);
});
