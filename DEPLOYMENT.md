# Развёртывание на Vercel

ClientFlow разворачивается как **два проекта Vercel из одного репозитория**:

| Проект | Root Directory | Что внутри |
|---|---|---|
| `clientflow-backend` | `backend` | Spring Boot в контейнере (`Dockerfile.vercel`), cron из `backend/vercel.json` |
| `clientflow` | `frontend` | React SPA (Vite); `/api/*` проксируется на backend через `frontend/vercel.json` |

Браузер обращается только к адресу frontend: cookie сессии и CSRF работают как на одном домене,
CORS не нужен. База — Supabase PostgreSQL, миграции Flyway применяются при старте backend.

## 1. Backend

1. Vercel → **Add New → Project** → выбрать репозиторий.
2. Project Name: `clientflow-backend`, **Root Directory: `backend`**. Vercel сам найдёт `Dockerfile.vercel`.
3. Environment Variables (Production):

| Переменная | Значение |
|---|---|
| `DB_URL` | строка подключения Supabase (Session pooler, порт 5432); подходит и `postgresql://user:pass@host/db` |
| `DB_USERNAME`, `DB_PASSWORD` | если их нет в `DB_URL` |
| `APP_PUBLIC_URL` | адрес frontend, например `https://clientflow.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | тот же адрес frontend |
| `CRON_SECRET` | длинная случайная строка |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM` | почта (см. README) |
| `GEMINI_API_KEY` | ключ Google Gemini для ИИ-помощника |
| `GEMINI_MODEL` | необязательно, по умолчанию `gemini-3.5-flash-lite` |

4. Deploy. Проверка: `https://<backend>.vercel.app/actuator/health` → `{"status":"UP"}`.

## 2. Frontend

1. Если адрес backend не `https://clientflow-backend.vercel.app` (имя занято, и Vercel добавил суффикс),
   замените его в `frontend/vercel.json` → `rewrites[0].destination` и сделайте push.
2. Vercel → **Add New → Project** → тот же репозиторий, Project Name: `clientflow`,
   **Root Directory: `frontend`**. Framework определится как Vite.
3. Переменные окружения не нужны (`VITE_API_URL` по умолчанию `/api/v1`).
4. Deploy. Затем убедитесь, что `APP_PUBLIC_URL` и `CORS_ALLOWED_ORIGINS` у backend совпадают
   с итоговым адресом frontend; если нет, исправьте и сделайте Redeploy backend.

## 3. Проверка после деплоя

- регистрация → письмо со ссылкой ведёт на адрес frontend;
- на дашборде видны кнопка «ИИ-помощник» и карточка «ИИ-сводка дня» (их нет, если не задан `GEMINI_API_KEY`);
- карточка клиента → «WhatsApp» открывает чат с готовым текстом.

## ИИ-помощник

Ключ Gemini хранится только в переменных backend и в браузер не передаётся. Помощник видит те же данные,
что и пользователь: сотрудник (EMPLOYEE) — только свои заказы. Почта и телефоны клиентов в Gemini не
отправляются. Лимит — 40 запросов к ИИ за 10 минут на пользователя. Если ключ не задан, кнопки ИИ скрыты,
остальное приложение работает как обычно.
