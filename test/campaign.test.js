import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillParams, runCampaign } from '../src/campaign.js';
import { isValidRadicado } from '../src/radicado.js';
import { WhatsAppError } from '../src/whatsapp.js';

const contacts = [{ phone: '573001234567', nombre: 'Ana' }, { phone: '573105550000', nombre: 'Carlos' }];
const noSleep = async () => {};

test('rellena parámetros', () => {
  assert.deepEqual(fillParams(['Hola {nombre}', '{radicado}'], { nombre: 'Ana', radicado: 'X' }), ['Hola Ana', 'X']);
});

test('envía con radicado único por contacto', async () => {
  const sent = [];
  const client = { sendTemplate: async (to, t) => { sent.push({ to, t }); return { id: `wamid.${to}` }; } };
  const s = await runCampaign({ contacts, template: { name: 'aviso', bodyParams: ['{nombre}', '{radicado}'] }, client, sleepFn: noSleep });
  assert.equal(s.enviados, 2);
  assert.equal(sent[0].t.bodyParams[0], 'Ana');
  assert.ok(isValidRadicado(sent[0].t.bodyParams[1]));
  assert.notEqual(s.results[0].radicado, s.results[1].radicado);
});

test('reintenta errores transitorios y reporta fallos definitivos', async () => {
  let calls = 0;
  const client = {
    sendTemplate: async (to) => {
      calls++;
      if (to === '573001234567' && calls === 1) throw new WhatsAppError('rate', { retryable: true });
      if (to === '573105550000') throw new WhatsAppError('número inválido', { retryable: false });
      return { id: 'ok' };
    },
  };
  const s = await runCampaign({ contacts, template: { name: 'aviso' }, client, sleepFn: noSleep });
  assert.equal(s.enviados, 1);
  assert.equal(s.fallidos, 1);
});

test('simulación no llama a la API', async () => {
  const client = { sendTemplate: async () => assert.fail('no debería enviar') };
  const s = await runCampaign({ contacts, template: { name: 'aviso' }, client, dryRun: true });
  assert.equal(s.simulados, 2);
});

test('guarda durante la campaña, no solo al final', async () => {
  let guardados = 0;
  const registrados = [];
  const store = {
    data: { campaigns: [] },
    recordRadicado: (r, info) => registrados.push(info),
    save: async () => { guardados++; },
  };
  const muchos = Array.from({ length: 25 }, (_, i) => ({ phone: `5730000000${String(i).padStart(2, '0')}` }));
  const client = { sendTemplate: async () => ({ id: 'wamid' }) };
  const s = await runCampaign({ contacts: muchos, template: { name: 'aviso' }, client, store, sleepFn: noSleep, saveEvery: 10 });
  assert.equal(guardados, 3); // tras 10, tras 20 y al final
  assert.ok(s.campaignId);
  assert.ok(registrados.every((r) => r.campaignId === s.campaignId));
  assert.equal(store.data.campaigns[0].id, s.campaignId);
});
