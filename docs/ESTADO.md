# bowa · Estado, auditoría y próximos pasos

_Corte: 27 de septiembre de 2026._

## 1. Resumen en 30 segundos

- ✅ **bowa ya envía WhatsApp de verdad.** Llegó un `hello_world` al teléfono de Juan desde la CLI y desde GitHub Actions.
- ✅ **El webhook responde:** `hola`, un número de radicado, `BAJA` y `ALTA`, por ahora con un túnel temporal desde el PC.
- ✅ **El token es permanente** (usuario del sistema) y los secretos están fuera del repo.
- ⏳ **Hay 7 PRs listos para aprobar (#3 a #9).** Se combinan sin conflictos: 52/52 pruebas.
- 🚧 **Para envíos masivos reales faltan tres cosas:** un número propio (hoy se usa el de prueba, con máximo 5 destinatarios), la plantilla `aviso_radicado` aprobada y un servidor 24/7.

## 2. Qué hay construido

| Pieza | Estado | Dónde |
|---|---|---|
| Envío individual con plantilla o texto libre (`bowa enviar`) | ✅ en `main` | `src/cli.js` |
| Campañas masivas desde CSV, con consentimiento, sin duplicados y respetando bajas (`bowa campana`) | ✅ en `main` | `src/campaign.js`, `src/contacts.js` |
| Radicados `PREFIJO-AAAAMMDD-XXXXXX-C` con dígito de control | ✅ en `main` | `src/radicado.js` |
| Cifrado AES-256-GCM en reposo y firma de Meta verificada | ✅ en `main` | `src/crypto.js`, `src/store.js` |
| Webhook: BAJA/ALTA, consulta de radicado, estados de entrega | ✅ en `main` | `src/server.js` |
| Envío de prueba desde GitHub Actions | ✅ en `main` | `.github/workflows/enviar-prueba.yml` |
| wamid visible en la salida | ⏳ PR #4 | `src/format.js` |
| Pruebas y lint en Windows | ⏳ PRs #3 y #5 | `test/`, `scripts/lint.js` |
| Acciones de CI en Node 24 | ⏳ PR #6 | `.github/workflows/` |
| Guía del webhook con cloudflared y registro por API | ⏳ PR #7 | `README.md` |
| Servidor 24/7 en Oracle Cloud gratis | ⏳ PR #8 | `deploy/` |
| Fiabilidad para envíos masivos (auditoría) | ⏳ PR #9 | `src/store.js`, `src/server.js` |

**Configuración en Meta, hecha por el agente local:** app con usuario del sistema y token permanente, plantilla `aviso_radicado` creada (categoría Utilidad, en revisión), webhook suscrito al campo `messages`. El número emisor es el **número de prueba** de Meta.

## 3. Auditoría del repositorio

Revisé todo el código con los PRs abiertos combinados. Los hallazgos graves ya tienen arreglo en el **PR #9**.

### Arreglados en el PR #9
| Severidad | Hallazgo |
|---|---|
| 🔴 | La CLI y el servidor guardan el mismo almacén, y el último en guardar borraba las **BAJAS** y estados del otro. |
| 🔴 | Un guardado fallido bloqueaba todos los guardados siguientes. |
| 🔴 | Si la respuesta a una BAJA fallaba, la BAJA no se guardaba. |
| 🟠 | Los estados de entrega podían retroceder (un "entregado" tardío pisaba un "leído"). |
| 🟠 | El webhook no tenía límite de tamaño de petición. |
| 🟠 | `BAJA.` o `¡Baja!` no se reconocían. |
| 🟠 | Una campaña interrumpida perdía los radicados de lo ya enviado. |
| 🟡 | `enviar --texto` no guardaba su radicado, y `enviar --enviar` no exigía la llave, así que no respetaba bajas. |

### Pendientes (no urgentes o requieren decisión)
| Severidad | Hallazgo | Propuesta |
|---|---|---|
| 🟠 | Repetir una campaña con el mismo CSV **vuelve a enviar a todos**. | `campana --reanudar <id>`, que salta a quien ya recibió (fase 3). |
| 🟠 | `campana --enviar` arranca sin confirmación. | Mostrar el total y pedir `--si` o una confirmación escrita (fase 3). |
| 🟠 | Los mensajes que escribe la gente **no se guardan**: Juan no puede leerlos. | Bandeja cifrada con `bowa bandeja` y `bowa responder` (fase 4). |
| 🟠 | Otra app de Meta ("EnElColegioMensaje") también está suscrita a la cuenta de WhatsApp y **recibe los mismos mensajes**. | Desuscribirla. Necesita un token de esa app (pendiente de Juan). |
| 🟡 | El almacén es un solo archivo que se reescribe completo en cada evento. | Sirve para miles de mensajes; para más, `node:sqlite`, que viene con Node (fase 5). |
| 🟡 | La huella de los teléfonos (HMAC) usa la misma llave que el cifrado. | Derivar dos sub-llaves con HKDF, con migración (fase 5). |
| 🟡 | El CSV acepta `,` y `;` a la vez: un nombre con coma sin comillas rompe la fila. | Detectar el separador a partir del encabezado. |
| 🟡 | La CI solo corre en Linux, y Juan usa Windows. | Agregar `windows-latest` a la CI (después del PR #6). |
| 🟡 | El `verify_token` del webhook se compara sin tiempo constante. | Usar `timingSafeEqual`, como con la firma. |
| ℹ️ | `package.json` dice `UNLICENSED`, pero el repo es público. | Juan decide: licencia abierta o repo privado. |
| ℹ️ | Consentimiento (Ley 1581): la columna `opt_in` no dice **cuándo ni cómo** se autorizó. | Agregar las columnas `fecha_autorizacion` y `fuente`, y conservar la evidencia. |

### Lo que está bien
- No hay secretos en el repo. `.env` y `data/` están en `.gitignore`, y ahora también los CSV de contactos reales.
- El cifrado usa IV aleatorio y etiqueta de autenticación. La firma de Meta se verifica en tiempo constante.
- Solo se usa la API oficial de WhatsApp Cloud: nada de librerías no oficiales.
- Un radicado solo se le muestra al número que lo recibió.
- No hay dependencias externas en tiempo de ejecución.

## 4. Próximos pasos: envío masivo y mensajes individuales

### Fase 0 · Aprobar lo que está listo (Juan, 10 min)
Hacer merge de **#3 → #9 → docs**. Cualquier orden funciona; está comprobado que se combinan limpio.

### Fase 1 · Servidor 24/7 (Juan, ~40 min)
1. Seguir `deploy/ORACLE.md`: VM gratis, dominio de DuckDNS e `install.sh`.
2. Registrar el webhook con la URL fija (paso 8 de la guía) y apagar el túnel del PC.
3. Desuscribir la app "EnElColegioMensaje" de la cuenta de WhatsApp.

### Fase 2 · Habilitar envíos a cualquier número (Juan, en Meta)
Hoy solo se puede enviar a 5 números de prueba. Para enviar a cualquier número hace falta:
1. **Un número propio** registrado en la cuenta de WhatsApp Business. No puede estar en uso en la app normal de WhatsApp.
2. **Un método de pago** en la cuenta de WhatsApp Business: Meta cobra por mensaje de plantilla.
3. **La plantilla `aviso_radicado` aprobada** (hoy en revisión). Si habrá mensajes promocionales, crear también una plantilla de Marketing.
4. **Verificar el negocio** para subir el límite diario de destinatarios. Sin verificar, Meta pone un tope bajo por día.
   - Juan no puede verificar con el portfolio actual.
   - Opción: un portfolio propio con su RUT. Hay que confirmar con Meta si acepta el tipo de documento.
   - Los límites exactos se ven en **WhatsApp Manager → Números de teléfono**.

### Fase 3 · Envío masivo seguro (código, bowa)
1. **Confirmación antes de enviar:** "Vas a enviar a 1.240 contactos con la plantilla X. Escribe SI".
2. **Reanudar campañas:** con `--reanudar <id>` no se reenvía a quien ya recibió.
3. **Reporte por campaña:** un CSV con radicado, wamid y estado (enviado, entregado, leído o fallido), más el comando `bowa campanas` para listarlas.
4. **Consentimiento con evidencia:** las columnas `fecha_autorizacion` y `fuente` en el CSV.

### Fase 4 · Mensajes individuales y bandeja (código, bowa)
1. Guardar **cifrados** los mensajes que llegan.
2. `bowa bandeja`: ver quién escribió y qué dijo.
3. `bowa responder <tel> "texto"`: avisa si ya pasaron las 24 h, porque entonces hace falta una plantilla.

### Fase 5 · Escala y endurecimiento
Pasar el almacén a `node:sqlite`, sub-llaves con HKDF, CI en Windows, separador CSV automático y `verify_token` en tiempo constante.

## 5. Cómo se trabaja en este repo
- **Una rama y un PR por tarea**, con pruebas en `test/` y `npm test` y `npm run lint` en verde.
- Copilot revisa cada PR, y sus hallazgos se atienden antes del merge.
- **Hay dos agentes de Claude:**
  - **En la nube:** tiene GitHub, pero no puede llegar a Meta.
  - **Local, en el PC de Juan:** tiene Meta, el `.env` y el túnel.
  - Se pasan el contexto con un bloque de reporte, sin secretos.
- **Nunca** van al repo, a los PRs ni al chat tokens, el app secret ni números de teléfono.
