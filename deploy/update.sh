#!/usr/bin/env bash
# Actualiza bowa a lo último de main y reinicia. Uso (en la VM): sudo bash /opt/bowa/deploy/update.sh
set -euo pipefail
sudo -u bowa git -C /opt/bowa pull --ff-only
cp /opt/bowa/deploy/bowa.service /etc/systemd/system/bowa.service
systemctl daemon-reload
systemctl restart bowa
systemctl --no-pager --lines=5 status bowa
