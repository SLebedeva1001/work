#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Ошибка: установите актуальную LTS-версию Node.js с https://nodejs.org/"
  exit 1
fi

NODE_OK="$(node -p "const [major, minor] = process.versions.node.split('.').map(Number); Number(major > 20 || (major === 20 && minor >= 19))")"
if [ "$NODE_OK" -ne 1 ]; then
  echo "Ошибка: требуется Node.js 20.19 или новее. Рекомендуется актуальная LTS-версия. Сейчас установлена $(node --version)."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Ошибка: npm не найден. Переустановите Node.js с https://nodejs.org/"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "Создан файл .env. Укажите в нём параметры Supabase перед рабочим запуском."
fi

mkdir -p data
if [ ! -f data/board.json ]; then
  cp data/board.seed.json data/board.json
fi

echo "Устанавливаю зависимости…"
npm install

echo "Проверяю сборку…"
npm run build

echo "Готово. Откройте .env, задайте секреты и затем запустите start-workspace.command"
