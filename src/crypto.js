// Cifrado autenticado AES-256-GCM para todo dato sensible que bowa guarda.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

export function generateKey() {
  return randomBytes(32).toString('base64');
}

export function parseKey(base64Key) {
  const key = Buffer.from(base64Key ?? '', 'base64');
  if (key.length !== 32) throw new Error('BOWA_ENCRYPTION_KEY debe ser 32 bytes en base64 (usa `npm run cli -- keygen`)');
  return key;
}

export function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':');
}

export function decrypt(payload, key) {
  const [version, iv, tag, ct] = String(payload).split(':');
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error('Formato cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

// Huella determinística (HMAC) para buscar un teléfono sin guardarlo en claro.
export function fingerprint(value, key) {
  return createHmac('sha256', key).update(String(value)).digest('base64url');
}

// Valida la cabecera X-Hub-Signature-256 que Meta envía en cada webhook.
export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!header?.startsWith('sha256=') || !appSecret) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const received = Buffer.from(header.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}
