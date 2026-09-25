# bowa — guía para Claude

Bot de envíos masivos por WhatsApp (Cloud API oficial de Meta), con cifrado AES-256-GCM en reposo y generador de radicados. Dueño: Juan. Idioma del producto, mensajes y documentación: **español (Colombia)**; zona horaria `America/Bogota`, indicativo por defecto `57`.

## Comandos
- `npm test` — pruebas con `node:test` (sin dependencias).
- `npm run lint` — verificación de sintaxis.
- `npm run cli -- <keygen|radicado|validar|campana>` — ver `src/cli.js`.
- `npm start` — servidor de webhook.

## Reglas
- Node 22+, ESM, **cero dependencias** en tiempo de ejecución salvo que sea imprescindible.
- Todo dato personal que se persista pasa por `EncryptedStore` (nunca en claro en disco ni en logs).
- Los envíos masivos solo con plantillas aprobadas y contactos con `opt_in`; siempre respetar `BAJA`.
- No usar librerías no oficiales de WhatsApp Web (whatsapp-web.js, Baileys): arriesgan el bloqueo del número.
- Formato de radicado: `PREFIJO-AAAAMMDD-XXXXXX-C` (Crockford base32 + control Luhn mod 32). No cambiarlo sin migración.
- Marca: minúsculas `bowa`, hueso `#F2EEE3`, verde `#25D366`, tinta `#0B141A`. Ver `brand/BRAND.md`.
- Toda función nueva lleva prueba en `test/`.
