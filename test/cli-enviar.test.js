// Prueba el comando "enviar" ejecutando la CLI como subproceso real (bot ejecutable).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CLI = new URL('../src/cli.js', import.meta.url).pathname;

test('enviar en simulación con plantilla', async () => {
  const { stdout } = await run('node', [CLI, 'enviar', '3001234567', '--plantilla', 'aviso_radicado', '--nombre', 'Ana']);
  assert.match(stdout, /🧪 simulado · 573001234567 · radicado BOWA-\d{8}-[0-9A-Z]{6}-[0-9A-Z]/);
});

test('enviar en simulación con texto libre', async () => {
  const { stdout } = await run('node', [CLI, 'enviar', '3001234567', '--texto', 'Tu radicado es {radicado}']);
  assert.match(stdout, /\[simulado\] → 573001234567: Tu radicado es BOWA-/);
});

test('enviar exige teléfono válido', async () => {
  await assert.rejects(run('node', [CLI, 'enviar', 'abc', '--plantilla', 'x']));
});

test('enviar exige plantilla o texto', async () => {
  await assert.rejects(run('node', [CLI, 'enviar', '3001234567']));
});

test('el binario es ejecutable directamente (#!/usr/bin/env node)', async () => {
  const { stdout } = await run(CLI, ['radicado', '1']);
  assert.match(stdout, /^BOWA-\d{8}-[0-9A-Z]{6}-[0-9A-Z]/);
});
