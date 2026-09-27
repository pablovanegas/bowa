// Verifica la sintaxis de cada .js en src/, test/ y scripts/ con `node --check`.
// Es multiplataforma: no depende de que la shell expanda globs (cmd en Windows no lo hace)
// y revisa archivo por archivo, porque `node --check a.js b.js` solo revisa el primero.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIRS = ['src', 'test', 'scripts'];

export function listJsFiles(dirs = DIRS) {
  return dirs.filter((dir) => existsSync(dir)).flatMap((dir) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => join(e.parentPath ?? e.path, e.name)),
  ).sort();
}

export function checkFile(file) {
  const { status, stderr } = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  return { file, ok: status === 0, error: stderr.trim() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = listJsFiles().map(checkFile);
  for (const r of results.filter((r) => !r.ok)) console.error(`✗ ${r.file}\n${r.error}\n`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${bad ? '❌' : '✅'} ${results.length - bad}/${results.length} archivos sin errores de sintaxis`);
  process.exitCode = bad ? 1 : 0;
}
