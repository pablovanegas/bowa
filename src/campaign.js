// Envío masivo: un radicado único por destinatario, ritmo controlado y reintentos con backoff.
import { randomUUID } from 'node:crypto';
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
  saveEvery = 10,        // guarda cada N envíos: si el proceso se cae, no se pierde lo ya enviado
  campaignId = randomUUID(), // pasar el de una campaña existente para reanudarla
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

    store?.recordRadicado(rad, { phone: contact.phone, template: template.name, campaignId, status: result.status, messageId: result.messageId });
    results.push(result);
    onResult(result);
    if (store && results.length % saveEvery === 0) await store.save();

    const wait = interval - (Date.now() - started);
    if (wait > 0 && !dryRun) await sleepFn(wait);
  }

  if (store) {
    // Una sola entrada por campaña: al reanudar se suman los totales.
    const now = new Date().toISOString();
    const prev = store.data.campaigns.find((c) => c.id === campaignId);
    const entry = {
      id: campaignId,
      at: prev?.at ?? now,
      updatedAt: now,
      template: template.name,
      total: (prev?.total ?? 0) + results.length,
      sent: (prev?.sent ?? 0) + results.filter((r) => r.status === 'enviado').length,
    };
    store.data.campaigns = [...store.data.campaigns.filter((c) => c.id !== campaignId), entry];
    await store.save();
  }

  return {
    campaignId,
    total: results.length,
    enviados: results.filter((r) => r.status === 'enviado').length,
    fallidos: results.filter((r) => r.status === 'fallido').length,
    simulados: results.filter((r) => r.status === 'simulado').length,
    results,
  };
}
