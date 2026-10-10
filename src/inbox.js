// Bandeja: resumen de conversaciones y ventana de 24 h de WhatsApp.

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Texto libre solo dentro de las 24 h siguientes al último mensaje de la persona.
export function withinServiceWindow(lastInboundAt, now = new Date()) {
  if (!lastInboundAt) return false;
  return now.getTime() - new Date(lastInboundAt).getTime() < SERVICE_WINDOW_MS;
}

// Una fila por persona: sin leer primero, después la conversación más reciente.
export function conversations(chat) {
  const byPhone = new Map();
  for (const m of Object.values(chat)) {
    const c = byPhone.get(m.phone) ?? { phone: m.phone, unread: 0, total: 0, last: null };
    c.total++;
    if (!m.read) c.unread++;
    if (!c.last || m.at > c.last.at) c.last = m;
    byPhone.set(m.phone, c);
  }
  return [...byPhone.values()].sort((a, b) => (b.unread > 0) - (a.unread > 0) || b.last.at.localeCompare(a.last.at));
}

export function preview(text, max = 50) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function formatWhen(iso, timeZone = 'America/Bogota') {
  return new Intl.DateTimeFormat('es-CO', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
