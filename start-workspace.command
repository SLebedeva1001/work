#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Ошибка: Node.js не найден. Сначала запустите setup-mac.command"
  exit 1
fi

NODE_OK="$(node -p "const [major, minor] = process.versions.node.split('.').map(Number); Number(major > 20 || (major === 20 && minor >= 19))")"
if [ "$NODE_OK" -ne 1 ]; then
  echo "Ошибка: требуется Node.js 20.19 или новее. Сейчас установлена $(node --version)."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Зависимости ещё не установлены. Сначала запустите setup-mac.command"
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3000}"
(sleep 1 && open "http://localhost:${PORT}") &
exec npm start
