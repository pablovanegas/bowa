#!/usr/bin/env node
// CLI de bowa.
//   keygen                         genera una llave de cifrado
//   radicado [n]                   genera n radicados de prueba
//   validar <radicado>             valida el dígito de control
//   campana <archivo.csv> --plantilla <nombre> [--idioma es] [--params "{nombre},{radicado}"] [--enviar]
//                                  por defecto es simulación; --enviar hace el envío real
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { runCampaign } from './campaign.js';
import { loadConfig, requireKeys } from './config.js';
import { prepareContacts, parseCsv } from './contacts.js';
import { generateKey, parseKey } from './crypto.js';
import { generateRadicado, isValidRadicado } from './radicado.js';
import { EncryptedStore } from './store.js';
import { WhatsAppClient } from './whatsapp.js';

const config = loadConfig();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    plantilla: { type: 'string' },
    idioma: { type: 'string', default: 'es' },
    params: { type: 'string', default: '{nombre},{radicado}' },
    enviar: { type: 'boolean', default: false },
  },
});
const [command, arg] = positionals;

switch (command) {
  case 'keygen':
    console.log(`BOWA_ENCRYPTION_KEY=${generateKey()}`);
    break;

  case 'radicado':
    for (let i = 0; i < Number(arg || 1); i++) console.log(generateRadicado({ prefix: config.radicadoPrefix, timeZone: config.timezone }));
    break;

  case 'validar':
    console.log(isValidRadicado(arg) ? '✅ radicado válido' : '❌ radicado inválido');
    process.exitCode = isValidRadicado(arg) ? 0 : 1;
    break;

  case 'campana': {
    if (!arg || !values.plantilla) throw new Error('Uso: campana <archivo.csv> --plantilla <nombre> [--enviar]');
    if (values.enviar) requireKeys(config, ['encryptionKey', 'whatsapp.token', 'whatsapp.phoneNumberId']);
    // En simulación la llave es opcional: sin ella no se consultan las bajas registradas.
    const store = config.encryptionKey ? await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load() : null;
    const { ready, skipped } = prepareContacts(parseCsv(await readFile(arg, 'utf8')), {
      defaultCountryCode: config.defaultCountryCode,
      isOptedOut: (p) => store?.isOptedOut(p) ?? false,
    });
    console.log(`Contactos listos: ${ready.length} · descartados: ${skipped.length}`);
    for (const s of skipped) console.log(`  – ${s.record.telefono ?? '?'}: ${s.reason}`);

    const summary = await runCampaign({
      contacts: ready,
      template: { name: values.plantilla, language: values.idioma, bodyParams: values.params.split(',').filter(Boolean) },
      client: new WhatsAppClient(config.whatsapp),
      store: values.enviar ? store : undefined,
      radicado: { prefix: config.radicadoPrefix, timeZone: config.timezone },
      ratePerSecond: config.ratePerSecond,
      dryRun: !values.enviar,
      onResult: (r) => console.log(`  ${r.status.padEnd(8)} ${r.phone} ${r.radicado}${r.error ? ` (${r.error})` : ''}`),
    });
    console.log(`\nTotal ${summary.total} · enviados ${summary.enviados} · fallidos ${summary.fallidos} · simulados ${summary.simulados}`);
    if (!values.enviar) console.log('Simulación. Agrega --enviar para enviar de verdad.');
    break;
  }

  default:
    console.log('Comandos: keygen | radicado [n] | validar <radicado> | campana <csv> --plantilla <nombre> [--enviar]');
}
