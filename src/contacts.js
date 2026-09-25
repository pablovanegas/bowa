// Lectura de contactos desde CSV y normalización de teléfonos a formato E.164 (sin '+').

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);

  const [header = [], ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function normalizePhone(raw, defaultCountryCode = '57') {
  let digits = String(raw ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 10 && defaultCountryCode) digits = defaultCountryCode + digits; // móvil nacional
  digits = digits.replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

const YES = new Set(['si', 'sí', 's', 'yes', 'y', 'true', '1', 'x']);

// Devuelve contactos válidos y con consentimiento, sin duplicados, y los descartados con su motivo.
export function prepareContacts(records, { defaultCountryCode = '57', isOptedOut = () => false } = {}) {
  const ready = [];
  const skipped = [];
  const seen = new Set();
  for (const r of records) {
    const phone = normalizePhone(r.telefono ?? r.phone ?? r.celular, defaultCountryCode);
    const consent = YES.has(String(r.opt_in ?? r.consentimiento ?? '').toLowerCase());
    if (!phone) skipped.push({ record: r, reason: 'telefono_invalido' });
    else if (!consent) skipped.push({ record: r, reason: 'sin_consentimiento' });
    else if (isOptedOut(phone)) skipped.push({ record: r, reason: 'dado_de_baja' });
    else if (seen.has(phone)) skipped.push({ record: r, reason: 'duplicado' });
    else { seen.add(phone); ready.push({ ...r, phone }); }
  }
  return { ready, skipped };
}
