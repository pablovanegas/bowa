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
