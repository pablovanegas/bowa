// Almacén local cifrado: todo el estado se guarda como un único blob AES-256-GCM.
// Suficiente para un MVP de un solo proceso; cambiar por una base de datos al escalar.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { decrypt, encrypt, fingerprint } from './crypto.js';

const EMPTY = () => ({ radicados: {}, optOuts: {}, campaigns: [] });

export class EncryptedStore {
  constructor(path, key) {
    this.path = path;
    this.key = key;
    this.data = EMPTY();
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      this.data = { ...EMPTY(), ...JSON.parse(decrypt(await readFile(this.path, 'utf8'), this.key)) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`No se pudo abrir el almacén cifrado: ${err.message}`);
    }
    return this;
  }

  save() {
    // Escrituras serializadas y atómicas (archivo temporal + rename).
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, encrypt(JSON.stringify(this.data), this.key), { mode: 0o600 });
      await rename(tmp, this.path);
    });
    return this.queue;
  }

  recordRadicado(radicado, info) {
    this.data.radicados[radicado] = { ...info, createdAt: new Date().toISOString() };
  }

  getRadicado(radicado) {
    return this.data.radicados[radicado] ?? null;
  }

  setOptOut(phone, optedOut = true) {
    const id = fingerprint(phone, this.key);
    if (optedOut) this.data.optOuts[id] = new Date().toISOString();
    else delete this.data.optOuts[id];
  }

  isOptedOut(phone) {
    return Boolean(this.data.optOuts[fingerprint(phone, this.key)]);
  }
}
