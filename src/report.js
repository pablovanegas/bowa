// Reportes de campañas: resumen por estado y exportación a CSV.

export const ESTADOS = ['enviado', 'entregado', 'leído', 'fallido'];

// Filas del reporte, con el estado vigente (el último que llegó por webhook).
export function campaignReport(store, campaignId) {
  return store.campaignRadicados(campaignId)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((r) => ({ radicado: r.radicado, telefono: r.phone, estado: r.status, wamid: r.messageId ?? '', fecha: r.createdAt ?? '' }));
}

export function countByStatus(rows) {
  const counts = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const r of rows) counts[r.estado] = (counts[r.estado] ?? 0) + 1;
  return counts;
}

export function formatCounts(counts) {
  return ESTADOS.map((e) => `${e} ${counts[e] ?? 0}`).join(' · ');
}

const quote = (v) => {
  const s = String(v ?? '');
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns = ['radicado', 'telefono', 'estado', 'wamid', 'fecha']) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => quote(r[c])).join(','))].join('\n') + '\n';
}
