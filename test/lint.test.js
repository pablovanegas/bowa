import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFile, listJsFiles } from '../scripts/lint.js';

const LINT = fileURLToPath(new URL('../scripts/lint.js', import.meta.url));

async function proyecto(archivos) {
  const dir = await mkdtemp(join(tmpdir(), 'bowa-lint-cli-'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  for (const [ruta, contenido] of Object.entries(archivos)) {
    await mkdir(join(dir, ruta, '..'), { recursive: true });
    await writeFile(join(dir, ruta), contenido);
  }
  return spawnSync(process.execPath, [LINT], { cwd: dir, encoding: 'utf8' });
}

test('revisa cada archivo por separado, incluidos subdirectorios', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bowa-lint-'));
  await mkdir(join(dir, 'sub'));
  // Como en el repo: ESM. Fuera de un paquete ESM, node --check no marca algunos errores de sintaxis.
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(dir, 'bien.js'), 'export const a = 1;\n');
  await writeFile(join(dir, 'sub', 'mal.js'), 'export const = ;\n');
  await writeFile(join(dir, 'nota.txt'), 'no es js');

  const files = listJsFiles([dir]);
  assert.deepEqual(files.map((f) => f.slice(dir.length + 1).replace(/\\/g, '/')), ['bien.js', 'sub/mal.js']);

  const [bien, mal] = files.map(checkFile);
  assert.ok(bien.ok);
  assert.ok(!mal.ok);
  assert.match(mal.error, /SyntaxError/);
});

test('el repo pasa el lint', () => {
  const bad = listJsFiles().map(checkFile).filter((r) => !r.ok);
  assert.deepEqual(bad, []);
});

test('npm run lint sale con 0 si todo está bien', async () => {
  const r = await proyecto({ 'src/a.js': 'export const a = 1;\n', 'test/b.js': 'export const b = 2;\n' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /2\/2 archivos/);
});

test('npm run lint sale con 1 si algún archivo tiene error', async () => {
  const r = await proyecto({ 'src/a.js': 'export const a = 1;\n', 'src/sub/roto.js': 'export const = ;\n' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /roto\.js/);
  assert.match(r.stdout, /1\/2 archivos/);
});
