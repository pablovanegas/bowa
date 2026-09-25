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
