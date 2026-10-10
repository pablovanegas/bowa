#!/usr/bin/env node
// CLI de bowa — bot ejecutable de envío de mensajes por WhatsApp.
//   keygen                         genera una llave de cifrado
//   radicado [n]                   genera n radicados de prueba
//   validar <radicado>             valida el dígito de control
//   enviar <telefono> --plantilla <nombre> [--idioma es] [--params "{nombre},{radicado}"] [--enviar]
//                                  un solo mensaje, con su propio radicado; --texto para responder en la ventana de 24h
//   campana <archivo.csv> --plantilla <nombre> [--idioma es] [--params "{nombre},{radicado}"] [--enviar [--si]]
//                                  por defecto es simulación; --enviar hace el envío real y pide confirmación
//                                  (--si la da por adelantado); --reanudar <id> salta a quien ya recibió
//   campanas                       lista las campañas con sus estados de entrega
//   reporte <id> [--salida archivo.csv]  exporta el detalle de una campaña
//
// Instalación como comando global: `npm link` (usa el bin "bowa" de package.json).
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { runCampaign } from './campaign.js';
import { loadConfig, requireKeys } from './config.js';
import { normalizePhone, prepareContacts, parseCsv } from './contacts.js';
import { generateKey, parseKey } from './crypto.js';
import { formatCampaignRow, formatSendResult } from './format.js';
import { generateRadicado, isValidRadicado } from './radicado.js';
import { campaignReport, countByStatus, formatCounts, toCsv } from './report.js';
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
    si: { type: 'boolean', default: false },
    reanudar: { type: 'string' },
    salida: { type: 'string' },
  },
});
const [command, arg] = positionals;

// Envío real a muchos: confirmación escrita, o --si para scripts. Sin terminal y sin --si, no envía.
async function confirmar(si) {
  if (si) return true;
  if (!process.stdin.isTTY) throw new Error('Falta confirmación: agrega --si para enviar sin terminal interactiva');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question('Escribe SI para enviar: ');
  rl.close();
  return respuesta.trim().toUpperCase() === 'SI';
}

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
    // La llave hace falta para respetar las bajas y guardar el radicado que se envía.
    if (values.enviar) requireKeys(config, ['encryptionKey', 'whatsapp.token', 'whatsapp.phoneNumberId']);

    const store = config.encryptionKey ? await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load() : null;
    if (store?.isOptedOut(phone)) throw new Error(`${phone} está dado de baja (BAJA). No se envía.`);
    const client = new WhatsAppClient(config.whatsapp);
    const rad = generateRadicado({ prefix: config.radicadoPrefix, timeZone: config.timezone });

    if (values.texto) {
      const body = values.texto.replaceAll('{radicado}', rad).replaceAll('{telefono}', phone);
      if (!values.enviar) { console.log(`[simulado] → ${phone}: ${body}`); break; }
      const { id } = await client.sendText(phone, body);
      store.recordRadicado(rad, { phone, template: null, status: 'enviado', messageId: id });
      await store.save();
      console.log(`✅ enviado ${phone} · radicado ${rad} · mensaje ${id}`);
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
      console.log(formatSendResult(r));
      if (!values.enviar) console.log('Simulación. Agrega --enviar para enviar de verdad.');
      if (r.status === 'fallido') process.exitCode = 1;
    }
    break;
  }

  case 'campana': {
    if (!arg || !values.plantilla) throw new Error('Uso: campana <archivo.csv> --plantilla <nombre> [--enviar]');
    if (values.enviar) requireKeys(config, ['encryptionKey', 'whatsapp.token', 'whatsapp.phoneNumberId']);
    if (values.reanudar) requireKeys(config, ['encryptionKey']);
    // En simulación la llave es opcional: sin ella no se consultan las bajas registradas.
    const store = config.encryptionKey ? await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load() : null;
    const { ready: listos, skipped } = prepareContacts(parseCsv(await readFile(arg, 'utf8')), {
      defaultCountryCode: config.defaultCountryCode,
      isOptedOut: (p) => store?.isOptedOut(p) ?? false,
    });

    // Reanudar: misma campaña, sin reenviar a quien ya recibió (los fallidos se reintentan).
    let campaignId;
    let ready = listos;
    if (values.reanudar) {
      const previa = store.findCampaign(values.reanudar);
      if (!previa) throw new Error(`No existe la campaña ${values.reanudar}. Mira las disponibles con: bowa campanas`);
      campaignId = previa.id;
      const recibieron = new Set(store.campaignRadicados(campaignId).filter((r) => r.status !== 'fallido').map((r) => r.phone));
      ready = listos.filter((c) => !recibieron.has(c.phone));
      console.log(`Reanudando campaña ${campaignId.slice(0, 8)}: ${listos.length - ready.length} ya recibieron y se omiten.`);
    }

    console.log(`Contactos listos: ${ready.length} · descartados: ${skipped.length}`);
    for (const s of skipped) console.log(`  – ${s.record.telefono ?? '?'}: ${s.reason}`);
    if (!ready.length) { console.log('No hay a quién enviar.'); break; }

    if (values.enviar) {
      campaignId ??= randomUUID();
      console.log(`\nCampaña ${campaignId.slice(0, 8)} · plantilla ${values.plantilla} (${values.idioma}) · ${ready.length} mensajes reales.`);
      if (!(await confirmar(values.si))) { console.log('Cancelado. No se envió nada.'); process.exitCode = 1; break; }
    }

    const summary = await runCampaign({
      contacts: ready,
      campaignId,
      template: { name: values.plantilla, language: values.idioma, bodyParams: values.params.split(',').filter(Boolean) },
      client: new WhatsAppClient(config.whatsapp),
      store: values.enviar ? store : undefined,
      radicado: { prefix: config.radicadoPrefix, timeZone: config.timezone },
      ratePerSecond: config.ratePerSecond,
      dryRun: !values.enviar,
      onResult: (r) => console.log(formatCampaignRow(r)),
    });
    console.log(`\nTotal ${summary.total} · enviados ${summary.enviados} · fallidos ${summary.fallidos} · simulados ${summary.simulados}`);
    if (!values.enviar) console.log('Simulación. Agrega --enviar para enviar de verdad.');
    else console.log(`Estados en vivo: bowa campanas · detalle: bowa reporte ${summary.campaignId.slice(0, 8)}`);
    break;
  }

  case 'campanas': {
    requireKeys(config, ['encryptionKey']);
    const store = await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load();
    const lista = [...store.data.campaigns].filter((c) => c.id).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    if (!lista.length) { console.log('Todavía no hay campañas enviadas.'); break; }
    for (const c of lista) {
      const conteo = countByStatus(campaignReport(store, c.id));
      console.log(`${c.id.slice(0, 8)}  ${(c.at ?? '').slice(0, 16).replace('T', ' ')}  ${c.template}  total ${c.total}  ·  ${formatCounts(conteo)}`);
    }
    break;
  }

  case 'reporte': {
    if (!arg) throw new Error('Uso: reporte <id de campaña> [--salida archivo.csv]');
    requireKeys(config, ['encryptionKey']);
    const store = await new EncryptedStore(config.storePath, parseKey(config.encryptionKey)).load();
    const campana = store.findCampaign(arg);
    if (!campana) throw new Error(`No existe la campaña ${arg}. Mira las disponibles con: bowa campanas`);
    const filas = campaignReport(store, campana.id);
    const salida = values.salida ?? `reporte-${campana.id.slice(0, 8)}.csv`;
    await writeFile(salida, toCsv(filas), { mode: 0o600 });
    console.log(`${filas.length} filas → ${salida}`);
    console.log(formatCounts(countByStatus(filas)));
    console.log('⚠️ El archivo tiene teléfonos: no lo subas al repo ni lo compartas.');
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
      '  campana <csv> --plantilla <n> [--params "{nombre},{radicado}"] [--enviar [--si]] [--reanudar <id>]',
      '  campanas                                  campañas enviadas y sus estados',
      '  reporte <id> [--salida archivo.csv]       detalle de una campaña en CSV',
    ].join('\n'));
}
