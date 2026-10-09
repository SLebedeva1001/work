# Перенос рабочего пространства Baby Trend на Mac

## Что потребуется

- macOS с доступом в интернет;
- Git;
- Node.js 20.19 или новее (рекомендуется актуальная LTS-версия Node.js 22);
- доступ к репозиторию `SLebedeva1001/work`;
- значения переменных Supabase и Render, если Mac должен работать с общей рабочей базой.

## Установка из GitHub

```bash
git clone https://github.com/SLebedeva1001/work.git
cd work
chmod +x setup-mac.command start-workspace.command
./setup-mac.command
```

После установки откройте `.env` и замените заглушки реальными значениями. Реальные ключи нельзя отправлять в GitHub или пересылать в открытом виде.

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-real-service-role-key
ADMIN_EMAIL=your-admin-email@example.com
APP_URL=http://localhost:3000
PORT=3000
DATA_FILE=./data/board.json
```

Для обычного последующего запуска дважды щёлкните `start-workspace.command` или выполните:

```bash
./start-workspace.command
```

Приложение откроется по адресу `http://localhost:3000`.

## Если macOS блокирует `.command`

Откройте Terminal в папке проекта и выполните:

```bash
chmod +x setup-mac.command start-workspace.command
xattr -d com.apple.quarantine setup-mac.command start-workspace.command 2>/dev/null || true
```

Затем запустите файл повторно. Также можно разрешить запуск в **System Settings → Privacy & Security**.

## Где находятся данные

Рабочие задачи, сотрудники и поставщики размещены в Supabase в записи `board_state/workspace`; пользователи и входы находятся в Supabase Auth. Клонирование GitHub переносит только программу, а не рабочую базу.

Без настроенного Supabase приложение использует локальные файлы `data/board.json` и `data/board.json.workspace.json`. Они исключены из Git и предназначены только для локальной разработки.

Перед переносом или закрытием Supabase отдельно создайте резервную копию базы средствами Supabase. Не помещайте экспорт базы, service-role key или пароли в репозиторий.

## Работающий сервер

Рабочая версия размещена на Render: `https://work-uw04.onrender.com/`. Локальный запуск на Mac не останавливает и не изменяет сервер. Если в `.env` указать рабочий Supabase, локальная копия будет обращаться к той же общей базе, поэтому любые изменения данных будут настоящими.

## Обновление проекта на Mac

```bash
git pull
npm install
npm run build
```

После обновления снова запустите `start-workspace.command`.
