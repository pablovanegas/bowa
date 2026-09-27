import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('host por defecto: todas las interfaces', () => {
  assert.equal(loadConfig({}).host, undefined);
});

test('BOWA_HOST limita la interfaz', () => {
  assert.equal(loadConfig({ BOWA_HOST: '127.0.0.1' }).host, '127.0.0.1');
});
