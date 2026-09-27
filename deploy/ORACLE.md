# bowa en Oracle Cloud (gratis, siempre encendido)

Objetivo: el webhook de bowa corriendo 24/7 en una VM gratis, con **URL fija y HTTPS**, sin depender de tu PC.

Tiempo: ~40 min. Costo: US$0 (Oracle pide tarjeta solo para verificar).

## Parte A · En el navegador

### 1. Cuenta
1. Entra a **oracle.com/cloud/free** → *Start for free*.
2. Elige tu **región de origen**. No se puede cambiar después, así que escoge la más cercana a Colombia que aparezca.

### 2. Crear la VM
1. Menú ☰ → **Compute → Instances → Create instance**.
2. **Image**: Canonical **Ubuntu 24.04**.
3. **Shape**: una marcada *Always Free eligible*. Sirve `VM.Standard.E2.1.Micro` (AMD) o `VM.Standard.A1.Flex` (ARM, 1 OCPU y 6 GB).
4. **SSH keys**: *Generate a key pair for me* → **descarga la llave privada** (`.key`) y guárdala.
5. **Create**. Cuando diga *Running*, copia la **Public IP address**.

### 3. Abrir los puertos 80 y 443
1. En la instancia, entra a la **Subnet** → **Security List** (la *Default*).
2. **Add Ingress Rules**, dos veces:
   - Source CIDR `0.0.0.0/0` · TCP · Destination port **80**
   - Source CIDR `0.0.0.0/0` · TCP · Destination port **443**

### 4. Dominio gratis
1. Entra a **duckdns.org** e inicia sesión.
2. Crea un subdominio, por ejemplo `bowa-juan`.
3. En *current ip* pon la **IP pública** de la VM → *update ip*.
4. Tu dominio queda como `bowa-juan.duckdns.org`.

## Parte B · En la terminal de tu PC (Windows 11 ya trae `ssh`)

### 5. Entrar a la VM
```powershell
ssh -i C:\ruta\a\tu-llave.key ubuntu@IP_PUBLICA
```
Si Windows se queja de los permisos de la llave, clic derecho → Propiedades → Seguridad → deja solo tu usuario.

### 6. Instalar bowa (dentro de la VM)
```bash
curl -fsSL https://raw.githubusercontent.com/pablovanegas/bowa/main/deploy/install.sh -o install.sh
sudo bash install.sh bowa-juan.duckdns.org
```
Instala Node 22, Caddy (HTTPS automático), el servicio `bowa` y abre el firewall de la VM. También genera `BOWA_ENCRYPTION_KEY` y `WHATSAPP_VERIFY_TOKEN` **nuevos**.

### 7. Poner los secretos de Meta
```bash
sudo nano /etc/bowa/bowa.env
```
Llena `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_APP_SECRET`, que son los mismos de tu `.env` local. Guarda con `Ctrl+O` y sal con `Ctrl+X`.
```bash
sudo systemctl restart bowa
curl https://bowa-juan.duckdns.org/health     # debe responder {"ok":true,"name":"bowa"}
```

### 8. Apuntar Meta a la URL fija
Repite el registro por API del README (sección *Registrar el webhook por API*) con:
- `callback_url=https://bowa-juan.duckdns.org/webhook`
- `verify_token` = el de la VM → `sudo grep VERIFY /etc/bowa/bowa.env`

Solo hay que hacerlo **una vez**: esta URL no cambia. Luego apaga el túnel `cloudflared` de tu PC.

## Día a día

| Qué | Comando (en la VM) |
|---|---|
| Ver si está vivo | `systemctl status bowa` |
| Ver mensajes en vivo | `journalctl -u bowa -f` |
| Actualizar a lo último de `main` | `sudo bash /opt/bowa/deploy/update.sh` |
| Reiniciar | `sudo systemctl restart bowa` |

## Seguridad y datos
- Los secretos viven en `/etc/bowa/bowa.env`, legible solo por root y el usuario `bowa`. **No** están en el repo.
- El almacén `/opt/bowa/data/bowa.store` está **cifrado** con `BOWA_ENCRYPTION_KEY`. Si Oracle ve el disco, solo ve texto cifrado.
- **Guarda `BOWA_ENCRYPTION_KEY` en tu gestor de contraseñas.** Sin ella, una copia del almacén no sirve.
- El servicio solo puede escribir en `/opt/bowa/data`, y Node solo escucha en `127.0.0.1`. Desde internet solo se entra por Caddy (HTTPS).
- Corre **una sola instancia**: el almacén es un archivo y dos procesos a la vez lo corromperían.

## Ojo
- Oracle puede **reclamar VMs gratis que pasan mucho tiempo ociosas**. Si te llega un aviso, pasar la cuenta a *Pay As You Go* evita el reclamo y sigue sin costo mientras no pases los límites *Always Free*. Revisa las condiciones actuales en Oracle.
- Si la IP pública cambia (por ejemplo, al recrear la VM), actualízala en DuckDNS.
