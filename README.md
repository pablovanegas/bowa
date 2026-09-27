<p align="center">
  <img src="brand/logo.svg" alt="bowa" width="360">
</p>

<p align="center"><b>Envíos masivos por WhatsApp. Cifrados. Con radicado.</b></p>

---

**bowa** es el bot de Juan para enviar mensajes masivos por WhatsApp de forma profesional: cada mensaje sale con un **radicado único y verificable**, y todo lo que el bot guarda queda **cifrado** con AES‑256‑GCM.

## Qué hace

- **Envíos masivos** con la API oficial de WhatsApp Cloud (Meta) usando plantillas aprobadas.
- **Radicados** con formato `BOWA-AAAAMMDD-XXXXXX-C` y dígito de control, que detecta errores de digitación.
- **Cifrado en reposo**: teléfonos, radicados y bajas se guardan en un almacén cifrado (`data/bowa.store`).
- **Consentimiento primero**: solo envía a contactos con `opt_in = si`, quita duplicados y respeta las bajas.
- **Respuestas automáticas**: el usuario escribe su radicado y recibe su estado; escribe `BAJA` y deja de recibir mensajes.
- **Ritmo controlado** y reintentos con backoff ante límites de la API.
- **Sin dependencias**: solo Node.js 22+.

## Empezar

```bash
cp .env.example .env
npm run cli -- keygen              # pega la llave en BOWA_ENCRYPTION_KEY
npm test
```

### Generar y validar radicados

```bash
npm run cli -- radicado 3
npm run cli -- validar BOWA-20260925-7K3QMZ-Z
```

### Un solo mensaje

```bash
# Mensaje con plantilla (inicia conversación): genera su propio radicado
npm run cli -- enviar 3001234567 --plantilla aviso_radicado --nombre "Ana"

# Respuesta de texto libre (solo dentro de la ventana de 24h tras un mensaje del usuario)
npm run cli -- enviar 3001234567 --texto "Tu radicado {radicado} fue entregado."

# Agrega --enviar para enviar de verdad; sin él, siempre es una simulación
```

Instalado como comando global (`npm link`), se usa directamente: `bowa enviar 3001234567 --plantilla aviso_radicado --enviar`.

### Campaña

Prepara un CSV (`,` o `;`) con al menos `telefono`, `nombre`, `opt_in`. Ver [`contactos.ejemplo.csv`](contactos.ejemplo.csv).

```bash
# Simulación (no envía nada)
npm run cli -- campana contactos.csv --plantilla aviso_radicado --params "{nombre},{radicado}"

# Envío real
npm run cli -- campana contactos.csv --plantilla aviso_radicado --params "{nombre},{radicado}" --enviar
```

Los `--params` llenan las variables `{{1}}`, `{{2}}`… de la plantilla. Puedes usar `{radicado}`, `{telefono}` o cualquier columna del CSV.

### Webhook

```bash
npm start      # expone /webhook y /health en el puerto PORT
```

En Meta for Developers → WhatsApp → Configuración, registra `https://tu-dominio/webhook` con tu `WHATSAPP_VERIFY_TOKEN` y suscríbete a `messages`. Cada petición se valida con la firma `X-Hub-Signature-256`.

#### Webhook local con cloudflared (pruebas)

Meta necesita una URL pública con HTTPS. Para probar desde tu PC:

1. Arranca bowa: `npm start` (escucha en `http://localhost:3000`).
2. En otra terminal abre un túnel rápido:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   Imprime una URL tipo `https://palabras-al-azar.trycloudflare.com`.
3. Registra esa URL en Meta (siguiente sección).

> ⚠️ El túnel rápido **cambia de URL cada vez que lo arrancas**. Cada reinicio obliga a repetir el paso 1 de la sección siguiente con la URL nueva. Mientras el PC esté apagado, bowa no recibe mensajes.

#### Registrar el webhook por API

Necesitas: `APP_ID` (ID de la app en Meta), `WHATSAPP_APP_SECRET`, `WABA_ID` (WhatsApp Business Account), `WHATSAPP_TOKEN` (token del usuario del sistema) y `WHATSAPP_VERIFY_TOKEN`. Ponlos como variables de entorno y **no los pegues en archivos que se suban al repo**.

1. **Suscribir la app al objeto `whatsapp_business_account`.** Usa el token de app, que es `APP_ID|APP_SECRET`. Al recibir esta llamada, Meta hace un `GET` a tu `/webhook` para verificarlo, así que bowa y el túnel deben estar arriba.
   ```bash
   curl -X POST "https://graph.facebook.com/v21.0/$APP_ID/subscriptions" \
     -d "object=whatsapp_business_account" \
     -d "callback_url=https://TU-URL.trycloudflare.com/webhook" \
     -d "verify_token=$WHATSAPP_VERIFY_TOKEN" \
     -d "fields=messages" \
     -d "access_token=$APP_ID|$WHATSAPP_APP_SECRET"
   ```
2. **Conectar la app a tu WABA.** Basta una vez, no hay que repetirlo al cambiar la URL:
   ```bash
   curl -X POST "https://graph.facebook.com/v21.0/$WABA_ID/subscribed_apps" \
     -H "Authorization: Bearer $WHATSAPP_TOKEN"
   ```
3. **Comprobar:**
   ```bash
   curl "https://graph.facebook.com/v21.0/$APP_ID/subscriptions?access_token=$APP_ID|$WHATSAPP_APP_SECRET"
   curl "https://graph.facebook.com/v21.0/$WABA_ID/subscribed_apps" -H "Authorization: Bearer $WHATSAPP_TOKEN"
   ```
   Si `subscribed_apps` muestra otras apps además de bowa, esas apps también reciben los mensajes.

En Windows usa `curl.exe` y cambia `\` por `` ` `` (PowerShell) o pon todo en una línea. Las variables se escriben `$env:APP_ID` en PowerShell.

## Configurar WhatsApp Cloud API

1. Crea una app tipo *Business* en [developers.facebook.com](https://developers.facebook.com/) y agrega el producto **WhatsApp**.
2. Copia el **Phone number ID** y genera un **token permanente** (usuario del sistema) → `.env`.
3. Crea y aprueba una plantilla, por ejemplo `aviso_radicado`:
   > Hola {{1}}, tu solicitud quedó registrada con el radicado **{{2}}**. Responde BAJA si no deseas recibir más mensajes.
4. Verifica tu negocio para subir el límite de conversaciones diarias.

## Estructura

```
src/
  radicado.js   generador y validador de radicados
  crypto.js     AES-256-GCM, huellas HMAC, firma de Meta
  store.js      almacén local cifrado
  contacts.js   CSV, teléfonos E.164, consentimiento
  whatsapp.js   cliente de WhatsApp Cloud API
  campaign.js   envío masivo con ritmo y reintentos
  server.js     webhook: bajas, consulta de radicados, estados
  cli.js        comandos de línea
brand/          logo, isotipo y manual de marca
test/           pruebas (node:test)
```

## Uso responsable

bowa está hecho para comunicación **con consentimiento** (clientes, trámites, notificaciones). Cumple la [política de WhatsApp Business](https://business.whatsapp.com/policy) y la Ley 1581 de 2012 de protección de datos en Colombia: pide autorización, ofrece siempre la baja y no compartas bases de datos.

## Marca

Hueso `#F2EEE3` · Verde WhatsApp `#25D366` · Tinta `#0B141A`. Ver [brand/BRAND.md](brand/BRAND.md).

<p align="center"><img src="brand/isotipo.svg" alt="" width="64"></p>
