// Revisa que los archivos de despliegue (deploy/) sean coherentes con la app.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';

const DEPLOY = fileURLToPath(new URL('../deploy/', import.meta.url));
const leer = (f) => readFileSync(DEPLOY + f, 'utf8');
const hayBash = process.platform !== 'win32' && spawnSync('bash', ['--version']).status === 0;

test('los scripts de deploy tienen sintaxis bash válida', { skip: !hayBash && 'sin bash' }, () => {
  for (const f of readdirSync(DEPLOY).filter((f) => f.endsWith('.sh'))) {
    const r = spawnSync('bash', ['-n', DEPLOY + f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('Caddy apunta al puerto por defecto de bowa', () => {
  assert.match(leer('Caddyfile'), new RegExp(`reverse_proxy 127\\.0\\.0\\.1:${loadConfig({}).port}\\b`));
});

test('el servicio solo puede escribir en la carpeta de datos del almacén', () => {
  const unit = leer('bowa.service');
  assert.match(unit, /^ProtectSystem=strict$/m);
  assert.match(unit, /^ReadWritePaths=\/opt\/bowa\/data$/m);
  assert.match(leer('install.sh'), /BOWA_STORE_PATH=\$APP\/data\/bowa\.store/);
});

test('Caddy arranca después de abrir el firewall (para que Let\'s Encrypt valide)', () => {
  const sh = leer('install.sh');
  const firewall = sh.indexOf('netfilter-persistent save');
  assert.ok(firewall > 0);
  assert.ok(!/systemctl (enable --now|start|restart) caddy/.test(sh.slice(0, firewall)), 'Caddy no debe arrancar antes del firewall');
  assert.match(sh.slice(firewall), /systemctl restart caddy/);
});

test('update.sh también instala el Caddyfile y recarga Caddy', () => {
  const sh = leer('update.sh');
  assert.match(sh, /cp \/opt\/bowa\/deploy\/Caddyfile \/etc\/caddy\/Caddyfile/);
  assert.match(sh, /systemctl reload caddy/);
});
