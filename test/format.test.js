import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCampaignRow, formatSendResult } from '../src/format.js';

const base = { phone: '573001234567', radicado: 'BOWA-20260927-7K3QMZ-Z' };

test('envío exitoso muestra el wamid', () => {
  assert.equal(
    formatSendResult({ ...base, status: 'enviado', messageId: 'wamid.HBgM' }),
    '✅ enviado · 573001234567 · radicado BOWA-20260927-7K3QMZ-Z · mensaje wamid.HBgM',
  );
});

test('simulación y fallo no inventan wamid', () => {
  assert.equal(formatSendResult({ ...base, status: 'simulado' }), '🧪 simulado · 573001234567 · radicado BOWA-20260927-7K3QMZ-Z');
  assert.equal(
    formatSendResult({ ...base, status: 'fallido', error: 'token vencido' }),
    '❌ fallido · 573001234567 · radicado BOWA-20260927-7K3QMZ-Z · token vencido',
  );
});

test('fila de campaña incluye el wamid', () => {
  assert.equal(formatCampaignRow({ ...base, status: 'enviado', messageId: 'wamid.X' }), '  enviado  573001234567 BOWA-20260927-7K3QMZ-Z wamid.X');
  assert.equal(formatCampaignRow({ ...base, status: 'fallido', error: 'e' }), '  fallido  573001234567 BOWA-20260927-7K3QMZ-Z (e)');
});
