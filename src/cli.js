#!/usr/bin/env node
// CLI de bowa — bot ejecutable de envío de mensajes por WhatsApp.
//   keygen                         genera una llave de cifrado
//   radicado [n]                   genera n radicados de prueba
//   validar <radicado>             valida el dígito de control
//   enviar <telefono> --plantilla <nombre> [--idioma es] [--params "{nombre},{radicado}"] [--enviar]
//                                  un solo mensaje, con su propio radicado; --texto para responder en la ventana de 24h
//   campana <archivo.csv> --plantilla <nombre> [--idioma es] [--params "{nombre},{radicado}"] [--enviar]
//                                  por defecto es simulación; --enviar hace el envío real
//
// Instalación como comando global: `npm link` (usa el bin "bowa" de package.json).
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { runCampaign } from './campaign.js';
import { loadConfig, requireKeys } from './config.js';
import { normalizePhone, prepareContacts, parseCsv } from './contacts.js';
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
    nombre: { type: 'string', default: '' },
    texto: { type: 'string' },
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

  case 'enviar': {
    if (!arg) throw new Error('Uso: enviar <telefono> --plantilla <nombre> [--nombre "Ana"] [--enviar]  |  enviar <telefono> --texto "mensaje" --enviar');
    const phone = normalizePhone(arg, config.defaultCountryCode);
    if (!phone) throw new Error(`Teléfono inválido: ${arg}`);
    if (!values.plantilla && !values.texto) throw new Error('Falta --plantilla <nombre> (mensaje iniciado por el negocio) o --texto "..." (respuesta dentro de 24h)');
    if (values.enviar) requireKeys(config, ['whatsapp.token', 'whatsapp.phoneNumberId']);

    const store = config.encryptionKey ? await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load() : null;
    if (store?.isOptedOut(phone)) throw new Error(`${phone} está dado de baja (BAJA). No se envía.`);
    const client = new WhatsAppClient(config.whatsapp);
    const rad = generateRadicado({ prefix: config.radicadoPrefix, timeZone: config.timezone });

    if (values.texto) {
      const body = values.texto.replaceAll('{radicado}', rad).replaceAll('{telefono}', phone);
      if (!values.enviar) { console.log(`[simulado] → ${phone}: ${body}`); break; }
      const { id } = await client.sendText(phone, body);
      console.log(`✅ enviado ${phone} · mensaje ${id}`);
    } else {
      const summary = await runCampaign({
        contacts: [{ phone, nombre: values.nombre }],
        template: { name: values.plantilla, language: values.idioma, bodyParams: values.params.split(',').filter(Boolean) },
        client,
        store: values.enviar ? store : undefined,
        radicado: { prefix: config.radicadoPrefix, timeZone: config.timezone },
        dryRun: !values.enviar,
      });
      const r = summary.results[0];
      console.log(`${r.status === 'enviado' ? '✅' : r.status === 'simulado' ? '🧪' : '❌'} ${r.status} · ${phone} · radicado ${r.radicado}${r.error ? ` · ${r.error}` : ''}`);
      if (!values.enviar) console.log('Simulación. Agrega --enviar para enviar de verdad.');
    }
    break;
  }

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
    console.log([
      'bowa · bot de envío de mensajes por WhatsApp',
      '',
      'Comandos:',
      '  keygen                                   genera una llave de cifrado',
      '  radicado [n]                              genera n radicados de prueba',
      '  validar <radicado>                        valida el dígito de control',
      '  enviar <telefono> --plantilla <n> [--nombre "Ana"] [--enviar]',
      '  enviar <telefono> --texto "..." [--enviar]',
      '  campana <csv> --plantilla <n> [--params "{nombre},{radicado}"] [--enviar]',
    ].join('\n'));
}
