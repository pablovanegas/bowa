// Líneas de salida de la CLI para cada resultado de envío.

const ICON = { enviado: '✅', simulado: '🧪', fallido: '❌' };

// Una línea por envío individual: estado · teléfono · radicado · wamid (si hay) · error (si hay).
export function formatSendResult(r) {
  return [
    `${ICON[r.status] ?? '•'} ${r.status}`,
    r.phone,
    `radicado ${r.radicado}`,
    r.messageId && `mensaje ${r.messageId}`,
    r.error,
  ].filter(Boolean).join(' · ');
}

// Una línea por contacto dentro de una campaña.
export function formatCampaignRow(r) {
  return `  ${r.status.padEnd(8)} ${r.phone} ${r.radicado}${r.messageId ? ` ${r.messageId}` : ''}${r.error ? ` (${r.error})` : ''}`;
}
