# bowa · Bitácora de procesos

Registro de lo que **de verdad** se hizo, con su evidencia. Sirve para que cualquier agente (o Juan) retome el trabajo sin suponer ni inventar.

## Cómo se usa
1. **Al empezar una sesión:** leer las últimas entradas y `docs/ESTADO.md`. Luego **contrastarlas** con el repo (`git fetch && git log --oneline origin/main`, PRs abiertos, `npm test`).
2. **Al terminar cada proceso:** agregar una fila en la *Línea de tiempo*, dentro del mismo PR del cambio.
3. **Cada dato lleva su fuente:**
   - ✅ **Verificado:** hay un commit, un PR, una salida de comando o una ejecución de CI que lo prueba.
   - 📣 **Reportado:** lo dijo Juan o el agente local y no se puede comprobar desde la nube (por ejemplo, lo que pasa en Meta).
   - ❓ **Supuesto:** todavía nadie lo comprobó. Hay que decirlo así y no presentarlo como hecho.
4. **Nunca** se anotan tokens, el app secret, la llave de cifrado, números de teléfono ni IDs de Meta.

## Hechos del entorno
| Hecho | Fuente |
|---|---|
| El agente en la nube **no puede** llegar a `graph.facebook.com`: el proxy lo niega, con curl y con Chromium. | ✅ probado el 2026-09-25 |
| El agente en la nube tiene GitHub (PRs, merges, CI) pero no puede controlar el PC de Juan. | ✅ |
| El agente local (Windows 11, Node 22.15) sí llega a Meta y tiene el `.env` real. | 📣 reporte del agente local, 2026-09-27 |
| Se envía desde el **número de prueba** de Meta: solo a destinatarios de prueba (máximo 5). | 📣 agente local |
| El negocio **no está verificado** en Meta; Juan no puede verificar con el portfolio actual. | 📣 Juan |
| El token de WhatsApp es **permanente** (usuario del sistema). Está en el `.env` local y en el secreto `WHATSAPP_TOKEN` del repo. | 📣 agente local |
| La plantilla `aviso_radicado` (Utilidad, español) está creada y **en revisión**. | 📣 agente local, 2026-09-27; revisar en Meta |
| La otra app "EnElColegioMensaje" sigue suscrita a la cuenta de WhatsApp y recibe los mismos mensajes. | 📣 agente local; pendiente de Juan |

## Línea de tiempo
| Fecha | Proceso | Evidencia | Resultado |
|---|---|---|---|
| 2026-09-25 | Entorno inicial: CLI, radicados, cifrado, webhook, marca y CI | PR #1 → `776c416` | ✅ 19 pruebas |
| 2026-09-25 | Workflow "enviar prueba" (GitHub Actions, por falta de salida a Meta) | PR #2 → `be4aebe` | ✅ |
| 2026-09-27 | Primer envío real: `hello_world` desde la CLI local y desde el workflow | Ejecución de Actions 36308023530 | 📣 llegó al teléfono de Juan |
| 2026-09-27 | Webhook probado con túnel rápido: `hola`, radicado, `BAJA`, `ALTA` | — | 📣 agente local |
| 2026-09-27 | Pruebas del CLI en Windows | PR #3 → `99c9296` | ✅ |
| 2026-09-27 | wamid visible en la salida de la CLI | PR #4 → `20cbd34` | ✅ |
| 2026-09-27 | Lint archivo por archivo, multiplataforma | PR #5 → `a45795f` | ✅ |
| 2026-09-27 | Acciones de CI en Node 24 (`@v7`) | PR #6 → `ccfca89` | ✅ |
| 2026-09-27 | Documentación del webhook con cloudflared y registro por API | PR #7 → `6dfed90` | ✅ |
| 2026-09-27 | Despliegue 24/7 en Oracle (scripts y guía) | PR #8 → `a9ae808` | ✅ código; ❓ **aún no instalado en una VM real** |
| 2026-09-27 | Auditoría: arreglos de fiabilidad (almacén compartido, BAJA, estados) | PR #9 → `7b10882` | ✅ 52 pruebas en `main` |
| 2026-09-27 | Estado, auditoría y roadmap (`docs/ESTADO.md`) | PR #10 → `1e713f3` | ✅ |
| 2026-09-27 | Fase 3: confirmación, `--reanudar`, `campanas` y `reporte` | PR #11 (`159c893`) | ⏳ abierto · ✅ 58 pruebas en la rama |
| 2026-09-27 | Fase 4: bandeja cifrada, `bandeja` y `responder` | PR #12 (`1275da7`), apilado sobre el #11 | ⏳ abierto · ✅ 64 pruebas en la rama |
| 2026-09-27 | Bitácora y protocolo anti-alucinación | PR #13, apilado sobre el #12 | ⏳ abierto |

## Errores y lecciones (para no repetirlos)
| Qué pasó | Lección |
|---|---|
| El radicado de ejemplo del README tenía un dígito de control inválido. | Todo ejemplo se genera o valida con la CLI (`bowa validar`); nunca se escribe a mano. |
| `node --check a.js b.js` solo revisa el primer archivo, y `cmd` en Windows no expande `src/*.js`. | Lint con `scripts/lint.js`, archivo por archivo. |
| Fuera de un paquete ESM, `node --check` no marca algunos errores de `export`. | Las pruebas de lint crean un `package.json` con `"type":"module"`. |
| La CLI y el servidor se pisaban el almacén: se perdían BAJAS. | Solo se escribe con los métodos del almacén y `save()` (candado y fusión). |
| Exigir la llave en `enviar --enviar` iba a romper el workflow de prueba (se detectó antes de subirlo). | Ante cualquier requisito nuevo, revisar **todos** los que llaman a esa función (workflows incluidos). |
| La URL del túnel rápido de cloudflared cambia en cada arranque. | Para producción, usar la VM con dominio fijo (`deploy/ORACLE.md`). |
| El primer token de Meta era temporal (dura 24 h) y no sirve entre sesiones. | Usar solo el token permanente de usuario del sistema. |
| Copilot encontró el secreto de la app en una URL de ejemplo. | Los tokens van siempre en la cabecera `Authorization`, también en la documentación. |
