import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkFile, listJsFiles } from '../scripts/lint.js';

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
