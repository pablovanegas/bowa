# bowa — guía para Claude

Bot de envíos masivos e individuales por WhatsApp (Cloud API oficial de Meta), con cifrado AES-256-GCM en reposo y generador de radicados. Dueño: Juan.

- Idioma del producto, los mensajes, la documentación y los commits: **español (Colombia)**. Zona horaria `America/Bogota`, indicativo por defecto `57`.
- Juan tiene TDAH: responde corto, en pasos numerados, y ajusta el detalle a la tarea.
- Estado actual, auditoría y roadmap: **`docs/ESTADO.md`**. Léelo antes de proponer trabajo.

## Comandos
- `npm test`: pruebas con `node:test` (sin dependencias).
- `npm run lint`: `node --check` archivo por archivo (`scripts/lint.js`); funciona en Windows.
- `npm run cli -- <keygen|radicado|validar|enviar|campana|campanas|reporte|bandeja|responder>`: ver `src/cli.js`. Sin `--enviar`, todo es simulación.
- `npm start`: servidor del webhook (`/webhook`, `/health`).

## Mapa
```
src/cli.js        CLI (bin "bowa")            src/server.js   webhook: bajas, radicados, estados
src/campaign.js   envío masivo con ritmo       src/store.js    almacén cifrado compartido (candado + fusión)
src/whatsapp.js   cliente Graph API            src/format.js   líneas de salida (incluye wamid)
src/report.js     reporte de campañas y CSV   src/inbox.js    bandeja y ventana de 24 h
src/contacts.js   CSV, E.164, consentimiento   src/radicado.js radicados con dígito de control
src/crypto.js     AES-GCM, HMAC, firma Meta    src/config.js   variables de entorno
deploy/           VM Oracle: install.sh, update.sh, bowa.service, Caddyfile, ORACLE.md
.github/workflows ci.yml (lint + test), enviar-prueba.yml (envío manual con secretos)
```

## Reglas
- Node 22+, ESM, **cero dependencias** en tiempo de ejecución salvo que sea imprescindible.
- Todo dato personal que se persista pasa por `EncryptedStore`. Nunca en claro en disco ni en logs.
- El almacén lo comparten la CLI y el servidor. Hay que usar sus métodos (`recordRadicado`, `updateMessageStatus`, `setOptOut`, `recordChat`) y `save()`, **nunca** escribir el archivo a mano. Cada `save()` fusiona con el disco bajo un candado.
- Los envíos masivos solo van con plantillas aprobadas y a contactos con `opt_in`. `BAJA` siempre se respeta y se guarda **antes** de responder.
- No usar librerías no oficiales de WhatsApp Web (whatsapp-web.js, Baileys): arriesgan el bloqueo del número.
- Formato de radicado: `PREFIJO-AAAAMMDD-XXXXXX-C` (Crockford base32 + control Luhn mod 32). No cambiarlo sin migración.
- Marca: `bowa` en minúsculas, hueso `#F2EEE3`, verde `#25D366`, tinta `#0B141A`. Ver `brand/BRAND.md`.
- **Nunca** van a commits, PRs, issues, logs ni al chat: tokens, el app secret, la llave de cifrado ni números de teléfono.

## Flujo de trabajo
- Una rama y un PR por tarea, hacia `main`. Toda función nueva lleva prueba en `test/`, y `npm test` y `npm run lint` deben estar en verde.
- Copilot revisa cada PR: se atienden sus hallazgos, se responde en el hilo y se resuelve.
- Hay dos agentes:
  - **En la nube:** tiene GitHub, pero no puede llegar a `graph.facebook.com`.
  - **Local, en el PC de Juan (Windows 11):** tiene Meta, el `.env` y el túnel.
  - Se pasan el contexto con un reporte sin secretos.
