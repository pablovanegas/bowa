// Fase 3: confirmación, reanudar, listado y reporte de campañas.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runCampaign } from '../src/campaign.js';
import { generateKey, parseKey } from '../src/crypto.js';
import { campaignReport, countByStatus, toCsv } from '../src/report.js';
import { EncryptedStore } from '../src/store.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const CSV = fileURLToPath(new URL('../contactos.ejemplo.csv', import.meta.url));
const noSleep = async () => {};

// Almacén con una campaña en la que 573001234567 ya recibió y 573105550000 falló.
async function conCampana() {
  const dir = await mkdtemp(join(tmpdir(), 'bowa-camp-'));
  const keyB64 = generateKey();
  const store = new EncryptedStore(join(dir, 'bowa.store'), parseKey(keyB64));
  const client = {
    sendTemplate: async (to) => {
      if (to === '573105550000') throw Object.assign(new Error('número no válido'), { retryable: false });
      return { id: `wamid.${to}` };
    },
  };
  const s = await runCampaign({
    contacts: [{ phone: '573001234567' }, { phone: '573105550000' }],
    template: { name: 'aviso' }, client, store, sleepFn: noSleep,
  });
  store.updateMessageStatus('wamid.573001234567', 'leído');
  await store.save();
  const env = { ...process.env, BOWA_ENCRYPTION_KEY: keyB64, BOWA_STORE_PATH: store.path, WHATSAPP_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' };
  return { dir, store, id: s.campaignId, env };
}

test('reporte con estados vigentes y CSV bien escapado', async () => {
  const { store, id } = await conCampana();
  const filas = campaignReport(store, id);
  assert.equal(filas.length, 2);
  assert.deepEqual(countByStatus(filas), { enviado: 0, entregado: 0, leído: 1, fallido: 1 });
  assert.equal(toCsv([{ radicado: 'R', telefono: '57', estado: 'a,b', wamid: 'x"y', fecha: '' }]),
    'radicado,telefono,estado,wamid,fecha\nR,57,"a,b","x""y",\n');
});

test('reanudar una campaña suma a la misma entrada, no crea otra', async () => {
  const { store, id } = await conCampana();
  const client = { sendTemplate: async () => ({ id: 'wamid.re' }) };
  await runCampaign({ contacts: [{ phone: '573105550000' }], template: { name: 'aviso' }, client, store, campaignId: id, sleepFn: noSleep });
  const entradas = store.data.campaigns.filter((c) => c.id === id);
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].total, 3);
  assert.equal(entradas[0].sent, 2);
});

test('findCampaign acepta el id corto y rechaza ids muy cortos', async () => {
  const { store, id } = await conCampana();
  assert.equal(store.findCampaign(id.slice(0, 8)).id, id);
  assert.equal(store.findCampaign('ffffffff'), null);
  assert.throws(() => store.findCampaign('abc'), /6 caracteres/);
});

test('campana --enviar sin terminal exige --si y no envía', async () => {
  const { env } = await conCampana();
  await assert.rejects(run('node', [CLI, 'campana', CSV, '--plantilla', 'aviso', '--enviar'], { env }), /--si/);
});

test('campana --reanudar omite a quien ya recibió y reintenta los fallidos', async () => {
  const { env, id } = await conCampana();
  const { stdout } = await run('node', [CLI, 'campana', CSV, '--plantilla', 'aviso', '--reanudar', id.slice(0, 8)], { env });
  assert.match(stdout, /1 ya recibieron/);
  assert.match(stdout, /simulado\s+573105550000/);
  assert.doesNotMatch(stdout, /simulado\s+573001234567/);
});

test('campanas y reporte desde la CLI', async () => {
  const { env, id, dir } = await conCampana();
  const lista = await run('node', [CLI, 'campanas'], { env });
  assert.match(lista.stdout, new RegExp(`${id.slice(0, 8)}.*aviso.*leído 1 · fallido 1`));

  const salida = join(dir, 'r.csv');
  const rep = await run('node', [CLI, 'reporte', id.slice(0, 8), '--salida', salida], { env });
  assert.match(rep.stdout, /2 filas/);
  const csv = await readFile(salida, 'utf8');
  assert.match(csv, /^radicado,telefono,estado,wamid,fecha\n/);
  assert.match(csv, /573001234567,leído,wamid\.573001234567/);
});
