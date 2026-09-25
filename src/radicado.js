// Generador de radicados: PREFIJO-AAAAMMDD-XXXXXX-C  (ej. BOWA-20260925-7K3QMZ-Z)
// XXXXXX es aleatorio en alfabeto Crockford base32 (sin I, L, O, U, para no
// confundir letras con números) y C es un dígito de control Luhn mod 32 sobre
// fecha + aleatorio, que detecta errores de digitación al consultar.
import { randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const N = ALPHABET.length;
const PATTERN = /^([A-Z0-9]{1,12})-(\d{8})-([0-9A-HJKMNP-TV-Z]{4,16})-([0-9A-HJKMNP-TV-Z])$/;

function checkChar(input) {
  let factor = 2;
  let sum = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    let addend = factor * ALPHABET.indexOf(input[i]);
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(addend / N) + (addend % N);
  }
  return ALPHABET[(N - (sum % N)) % N];
}

function datePart(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}${get('month')}${get('day')}`;
}

export function generateRadicado({ prefix = 'BOWA', date = new Date(), timeZone = 'America/Bogota', length = 6 } = {}) {
  const cleanPrefix = String(prefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!cleanPrefix) throw new Error('Prefijo de radicado vacío');
  const day = datePart(date, timeZone);
  let random = '';
  for (let i = 0; i < length; i++) random += ALPHABET[randomInt(N)];
  return `${cleanPrefix}-${day}-${random}-${checkChar(day + random)}`;
}

export function normalizeRadicado(input) {
  // Tolera minúsculas y las confusiones típicas al digitar (O→0, I/L→1).
  const [prefix, ...rest] = String(input).trim().toUpperCase().split('-');
  return [prefix, ...rest.map((p) => p.replace(/O/g, '0').replace(/[IL]/g, '1'))].join('-');
}

export function isValidRadicado(input) {
  const m = normalizeRadicado(input).match(PATTERN);
  return Boolean(m) && checkChar(m[2] + m[3]) === m[4];
}
