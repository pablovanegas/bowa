// Envío masivo: un radicado único por destinatario, ritmo controlado y reintentos con backoff.
import { generateRadicado } from './radicado.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reemplaza {nombre}, {radicado}, {telefono} o cualquier columna del CSV.
export function fillParams(params, vars) {
  return params.map((p) => String(p).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''));
}

export async function runCampaign({
  contacts,
  template,              // { name, language, bodyParams: ['{nombre}', '{radicado}'] }
  client,                // WhatsAppClient (o un doble en pruebas)
  store,                 // EncryptedStore opcional para registrar radicados
  radicado = {},         // { prefix, timeZone }
  ratePerSecond = 10,
  maxRetries = 3,
  dryRun = false,
  onResult = () => {},
  sleepFn = sleep,
}) {
  const interval = 1000 / Math.max(ratePerSecond, 0.1);
  const results = [];

  for (const contact of contacts) {
    const started = Date.now();
    const rad = generateRadicado(radicado);
    const vars = { ...contact, radicado: rad, telefono: contact.phone };
    const bodyParams = fillParams(template.bodyParams ?? [], vars);
    const result = { phone: contact.phone, radicado: rad, status: 'pendiente' };

    if (dryRun) {
      Object.assign(result, { status: 'simulado', bodyParams });
    } else {
      for (let attempt = 0; ; attempt++) {
        try {
          const { id } = await client.sendTemplate(contact.phone, { ...template, bodyParams });
          Object.assign(result, { status: 'enviado', messageId: id });
          break;
        } catch (err) {
          if (err.retryable && attempt < maxRetries) { await sleepFn(2 ** attempt * 1000); continue; }
          Object.assign(result, { status: 'fallido', error: err.message });
          break;
        }
      }
    }

    store?.recordRadicado(rad, { phone: contact.phone, template: template.name, status: result.status, messageId: result.messageId });
    results.push(result);
    onResult(result);

    const wait = interval - (Date.now() - started);
    if (wait > 0 && !dryRun) await sleepFn(wait);
  }

  if (store) {
    store.data.campaigns.push({ at: new Date().toISOString(), template: template.name, total: results.length, sent: results.filter((r) => r.status === 'enviado').length });
    await store.save();
  }

  return {
    total: results.length,
    enviados: results.filter((r) => r.status === 'enviado').length,
    fallidos: results.filter((r) => r.status === 'fallido').length,
    simulados: results.filter((r) => r.status === 'simulado').length,
    results,
  };
}
