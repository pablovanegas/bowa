#!/bin/bash
# Prepara el entorno de bowa al iniciar una sesión de Claude Code en la web.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"

node -e 'const [maj]=process.versions.node.split(".");if(+maj<22){console.error("bowa requiere Node 22+");process.exit(1)}'
[ -f package-lock.json ] && npm ci --no-audit --no-fund || true

# .env de desarrollo con una llave efímera, para poder correr la CLI en simulación.
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^BOWA_ENCRYPTION_KEY=.*|BOWA_ENCRYPTION_KEY=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')|" .env
fi
