#!/usr/bin/env bash
# Instala bowa en una VM Ubuntu (22.04/24.04) de Oracle Cloud Always Free.
# Uso (en la VM):  sudo bash install.sh tu-subdominio.duckdns.org
# Se puede volver a correr: no borra datos ni secretos existentes.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMAIN="${1:?Uso: sudo bash install.sh <dominio>}"
REPO="${BOWA_REPO:-https://github.com/pablovanegas/bowa.git}"
APP=/opt/bowa
ENV_DIR=/etc/bowa

[ "$(id -u)" -eq 0 ] || { echo "Corre con sudo"; exit 1; }

echo "1/7 Paquetes base"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

echo "2/7 Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "3/7 Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "4/7 Usuario y código"
id bowa >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin bowa
if [ -d "$APP/.git" ]; then sudo -u bowa git -C "$APP" pull --ff-only; else git clone "$REPO" "$APP"; fi
mkdir -p "$APP/data"
chown -R bowa:bowa "$APP"
chmod 700 "$APP/data"

echo "5/7 Secretos"
mkdir -p "$ENV_DIR"
if [ ! -f "$ENV_DIR/bowa.env" ]; then
  cp "$APP/.env.example" "$ENV_DIR/bowa.env"
  KEY=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')
  VERIFY=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')
  sed -i "s|^BOWA_ENCRYPTION_KEY=.*|BOWA_ENCRYPTION_KEY=$KEY|; s|^WHATSAPP_VERIFY_TOKEN=.*|WHATSAPP_VERIFY_TOKEN=$VERIFY|; s|^BOWA_HOST=.*|BOWA_HOST=127.0.0.1|; s|^BOWA_STORE_PATH=.*|BOWA_STORE_PATH=$APP/data/bowa.store|" "$ENV_DIR/bowa.env"
  NEEDS_SECRETS=1
fi
chown root:bowa "$ENV_DIR/bowa.env"
chmod 640 "$ENV_DIR/bowa.env"

echo "6/7 Servicios"
cp "$APP/deploy/bowa.service" /etc/systemd/system/bowa.service
cp "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile
grep -q '^BOWA_DOMAIN=' /etc/default/caddy 2>/dev/null && sed -i "s|^BOWA_DOMAIN=.*|BOWA_DOMAIN=$DOMAIN|" /etc/default/caddy || echo "BOWA_DOMAIN=$DOMAIN" >> /etc/default/caddy
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/default/caddy\n' > /etc/systemd/system/caddy.service.d/bowa.conf
systemctl daemon-reload
# Se habilita sin (re)arrancar: el certificado se pide después de abrir el firewall.
systemctl enable caddy

echo "7/7 Firewall de la VM (puertos 80 y 443)"
# Las imágenes Ubuntu de Oracle traen iptables con todo cerrado salvo SSH.
# Se insertan antes de la regla REJECT final para que tengan efecto.
for p in 80 443; do
  iptables -C INPUT -m state --state NEW -p tcp --dport "$p" -j ACCEPT 2>/dev/null && continue
  n=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
  if [ -n "$n" ]; then iptables -I INPUT "$n" -m state --state NEW -p tcp --dport "$p" -j ACCEPT
  else iptables -A INPUT -m state --state NEW -p tcp --dport "$p" -j ACCEPT; fi
done
netfilter-persistent save >/dev/null

# Con 80/443 abiertos, Let's Encrypt ya puede validar el dominio.
systemctl restart caddy

if [ "${NEEDS_SECRETS:-0}" = 1 ]; then
  systemctl enable bowa
  echo
  echo "Listo a medias: falta poner los secretos de Meta."
  echo "  sudo nano $ENV_DIR/bowa.env   (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET)"
  echo "  sudo systemctl restart bowa"
else
  systemctl enable bowa
  systemctl restart bowa
  echo
  echo "Listo. Prueba: curl https://$DOMAIN/health"
fi
