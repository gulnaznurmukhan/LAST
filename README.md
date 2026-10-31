# ClientFlow

Учёт клиентов и заказов для малого бизнеса.
Курсовая работа: «Клиенттер мен тапсырыстарды есепке алу жүйесін әзірлеу».

Развёртывание: [DEPLOYMENT.md](DEPLOYMENT.md).
Спецификация: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md),
[BUSINESS_ARCHITECTURE.md](BUSINESS_ARCHITECTURE.md),
[SECURITY_AND_DEPLOYMENT.md](SECURITY_AND_DEPLOYMENT.md).
План и статус: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Стек и версии

| Часть | Технологии |
|---|---|
| Backend | Java 21, Spring Boot 4.1.2 (Spring Security 7, Data JPA, Spring Session JDBC), Flyway, springdoc-openapi 3.2.0, Argon2 (BouncyCastle 1.86) |
| База данных | PostgreSQL 17 (локально — Docker, в production — Supabase) |
| Frontend | React 19, TypeScript 7, Vite 8, Tailwind CSS 4, shadcn/ui, React Router 7, TanStack Query 5, i18next, react-hook-form + zod |
| Тесты | JUnit 5 + Spring Boot Test + Testcontainers; Vitest 5 + React Testing Library |
| Деплой | Vercel (frontend и backend-контейнер), Supabase PostgreSQL |

## Структура

```
backend/    Spring Boot REST API (/api/v1), миграции Flyway в src/main/resources/db/migration
frontend/   React SPA (Vite)
docker-compose.yml   локальное окружение: PostgreSQL, Mailpit, backend, frontend
```

## Локальный запуск

Требуется Docker Desktop. Если команда `docker` не найдена, добавьте в PATH
`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`.

**Всё в Docker** (как в production):

```bash
docker compose up -d --build
```

| Адрес | Что это |
|---|---|
| http://localhost:3000 | Приложение (nginx отдаёт frontend и проксирует `/api` на backend) |
| http://localhost:8025 | Mailpit — входящие письма для разработки (ничего не уходит наружу) |
| http://localhost:3000/api/v1/docs | Swagger UI (только dev) |
| http://localhost:8080/actuator/health | Health check backend |

**Режим разработки** (горячая перезагрузка):

```bash
docker compose up -d db mailpit          # только инфраструктура
cd backend && ./mvnw spring-boot:run     # API на :8080 (профиль dev)
cd frontend && npm install && npm run dev  # UI на http://localhost:5173, /api проксируется на :8080
```

## Тесты и сборка

```bash
cd backend && ./mvnw verify      # тесты на настоящем PostgreSQL 17 (Testcontainers, нужен Docker)
cd frontend && npm test          # Vitest
cd frontend && npm run build     # production-сборка
cd frontend && npm run lint
```

Тесты никогда не используют production-базу.

## Конфигурация

Все секреты передаются через переменные окружения; список с заглушками —
[.env.example](.env.example). Файл `.env` в git не попадает.
В переменные `VITE_*` нельзя помещать секреты — они встраиваются в JS-бандл.

## Почта (Gmail SMTP)

В разработке письма попадают в Mailpit (http://localhost:8025). Для production используется Gmail SMTP —
бесплатно (около 500 писем в сутки), домен не нужен:

1. В аккаунте Google включите двухэтапную аутентификацию.
2. Создайте пароль приложения: https://myaccount.google.com/apppasswords (16 символов).
3. Задайте переменные окружения backend:
   `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USERNAME=<ваш gmail>`,
   `SMTP_PASSWORD=<пароль приложения>`, `SMTP_AUTH=true`, `SMTP_STARTTLS=true`,
   `MAIL_FROM=ClientFlow <ваш gmail>`.

Проверить настоящую отправку локально: впишите те же строки в корневой `.env` и выполните
`docker compose up -d backend` — docker-compose возьмёт их вместо Mailpit. Без них письма
по-прежнему уходят в Mailpit. У SMTP стоят таймауты 10 с, поэтому недоступный сервер не
подвешивает регистрацию: ошибка пишется в лог, а письмо можно запросить повторно.

Пароль приложения — секрет: только в настройках хостинга или в локальном `.env`, никогда в git.

## Удаление аккаунта

Требует пароль и подтверждение. Рабочие пространства, где пользователь — OWNER, удаляются
полностью (клиенты, заказы, оплаты, история, участники). В остальных пространствах членство
снимается, его заказы остаются без исполнителя. В истории действий автор становится
«удалённым пользователем», email удаляется из деталей. Все сессии отзываются.

## Безопасность базы Supabase

Supabase публикует схему `public` через свой Data API, а publishable-ключ
публичен по определению. Поэтому:

- все таблицы ClientFlow находятся в отдельной схеме `clientflow`;
- миграция `V3` отзывает у ролей `anon` и `authenticated` любой доступ к ней;
- frontend не использует Supabase-ключи — все данные идут только через Spring Boot API.

## Статус

| Фаза | Статус |
|---|---|
| 1. Анализ и план | ✅ |
| 2. Каркас, БД, Flyway, Docker | ✅ |
| 3. Аутентификация и безопасность | ✅ |
| 4. Клиенты, заказы, рабочие пространства, роли | ✅ |
| 5. Оплаты и финансовые правила | ✅ |
| 6. Дашборд, отчёты, CSV, уведомления | ✅ |
| 7. Профиль, настройки, языки, темы, адаптивность | ✅ |
| 8. Тесты, исправления, подготовка деплоя | ✅ (деплой — по [DEPLOYMENT.md](DEPLOYMENT.md)) |

| Доп. функции: прайс-лист и позиции, счёт, ссылка для клиента, импорт CSV, выручка и календарь | ✅ |

Автотесты: 128 backend (JUnit + Testcontainers), 48 frontend (Vitest + RTL), плюс два сквозных
сценария в настоящем браузере (Chrome) поверх docker-compose.

## Дополнительные функции

| Функция | Что важно |
|---|---|
| **Прайс-лист и позиции заказа** | Сумма заказа с позициями считается только сервером: `строка = кол-во × цена` (округление HALF_UP), итог = сумма строк. Для услуги из прайса цена берётся из каталога — цена из браузера игнорируется. Позиция хранит снимок названия и цены. |
| **Счёт на оплату** | Реквизиты компании (БИН, ИИК/IBAN, БИК, банк) задаёт владелец; печатная форма сохраняется в PDF через печать браузера. |
| **Ссылка для клиента** | `/p/{token}`: статус, позиции и оплаты без регистрации. 256-битный токен, в БД — только хеш, срок 90 дней, отзыв, rate limit; внутренние заметки, сотрудники и контакты не передаются. |
| **Импорт клиентов из CSV** | Предпросмотр → импорт; UTF-8/Windows-1251, разделитель `;` или `,`, заголовки на 3 языках, проверка строк и дубликатов (в базе и в файле), всё в одной транзакции. |
| **Выручка и календарь** | График оплат по месяцам за 12 месяцев (по валютам), календарь сроков заказов (месяц / список на телефоне). |
| **ИИ-помощник (Gemini)** | Чат на каждой странице: отвечает по настоящим данным пространства (долги, сроки, выручка), с учётом роли. Ключ только на сервере (`GEMINI_API_KEY`), лимит 40 запросов / 10 мин. |
| **ИИ-сводка дня** | Карточка на дашборде: просрочки, должники, динамика оплат и одна рекомендация. |
| **Заказ из сообщения** | В форме нового заказа: вставить сообщение клиента из WhatsApp — ИИ заполнит название, детали, сумму и срок, найдёт клиента по телефону или имени или предложит создать нового. Ответ модели проверяется на сервере (сумма, валюта, дата не в прошлом). |
| **WhatsApp с готовым текстом** | Кнопка в карточке клиента, заказа и в списке клиентов: повод (заказ принят / готов / оплата / спасибо / отзыв), язык, шаблон или текст от ИИ, ссылка на заказ; открывается `wa.me` с подставленным текстом. Номера `8 7xx…` приводятся к `77xx…`. |

## API (кратко)

Полная документация — Swagger UI: `/api/v1/docs` (в dev). Все бизнес-ресурсы вложены в рабочее
пространство: сервер на каждом запросе проверяет, что пользователь — его участник, и читает роль из БД.

| Ресурс | Эндпоинты |
|---|---|
| Аутентификация | `/api/v1/auth/{csrf,register,verify-email,resend-verification,login,logout,forgot-password,reset-password}` |
| Профиль и аккаунт | `GET/PATCH/DELETE /api/v1/users/me`, `PUT /users/me/notification-settings`, `POST /users/me/password`, `PUT/GET/DELETE /users/me/avatar`, `GET /users/me/sessions`, `DELETE /users/me/sessions/{key}`, `POST /users/me/sessions/revoke-others` |
| Рабочее пространство | `GET/PATCH /api/v1/workspaces/{ws}`, `GET /activity` |
| Команда | `GET/POST /members`, `PATCH/DELETE /members/{userId}`, `DELETE /invitations/{id}` |
| Клиенты | `GET/POST /clients`, `GET/PUT /clients/{id}`, `POST /clients/{id}/{archive,restore}`, `GET /clients/duplicates` |
| Оплаты | `GET/POST /orders/{id}/payments` (заголовок `Idempotency-Key`), `POST /orders/{id}/payments/{paymentId}/void` |
| Дашборд и отчёты | `GET /dashboard?from&to`, `GET /reports/{orders,payments}` и `…/{orders,payments}.csv` (OWNER/MANAGER) |
| Уведомления | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| Фоновая задача | `GET /api/v1/internal/cron/maintenance` с заголовком `Authorization: Bearer $CRON_SECRET` (для Vercel Cron) |
| Прайс-лист | `GET/POST /services`, `PUT /services/{id}`, `POST /services/{id}/{archive,restore}` |
| Позиции, счёт, ссылка | `GET/PUT /orders/{id}/items`, `GET /orders/{id}/invoice`, `GET/POST/DELETE /orders/{id}/share-link`, публично: `GET /api/v1/public/orders/{token}` |
| Реквизиты, импорт, календарь | `GET/PUT /requisites`, `POST /clients/import?dryRun=`, `GET /dashboard/revenue`, `GET /calendar?from&to` |
| ИИ | `GET /api/v1/ai/status`, `POST /ai/{chat,insights,message,parse-order}` |
| Заказы | `GET/POST /orders`, `GET /orders/board`, `GET/PUT /orders/{id}`, `POST /orders/{id}/{status,archive,restore}`, `GET/POST /orders/{id}/notes`, `GET /orders/{id}/activity` |

## Роли

| Действие | OWNER | MANAGER | EMPLOYEE |
|---|---|---|---|
| Команда, переименование пространства | ✔ | — | — |
| Клиенты: создание, изменение, архив | ✔ | ✔ | только просмотр |
| Заказы: создание, изменение, архив | ✔ | ✔ | — |
| Видимость заказов | все | все | только назначенные |
| Смена статуса | любая допустимая | любая допустимая | свои: CONFIRMED→IN_PROGRESS→COMPLETED |
| Журнал действий пространства | ✔ | ✔ | — |

## Финансовые правила

- Деньги — `BigDecimal` в Java и `NUMERIC(14,2)` в PostgreSQL; frontend передаёт суммы строками и не считает деньги.
- `оплачено = сумма неотменённых платежей`, `остаток = сумма заказа − оплачено`; остаток не хранится.
  Состояние: `UNPAID` (0), `PARTIALLY_PAID` (0 < оплачено < сумма), `PAID` (оплачено = сумма).
- Платёж > 0, не больше остатка, дата не в будущем, только для неотменённых и неархивных заказов.
- Параллельные платежи: строка заказа блокируется (`SELECT … FOR UPDATE`) — проверка лимита и вставка
  выполняются последовательно.
- Повторная отправка: клиент генерирует `Idempotency-Key` (UUID) на каждую попытку оплаты и повторяет его
  при ретрае; уникальный индекс `(workspace_id, idempotency_key)` гарантирует один платёж.
- Исправления: платёж не редактируется и не удаляется — только отменяется с причиной (кто, когда, почему);
  оба события пишутся в журнал.
- Сумму заказа нельзя сделать меньше оплаченной; валюту нельзя менять при наличии платежей;
  заказ с действующими платежами нельзя отменить, пока они не отменены (возврат).

Статусы заказа: `NEW → CONFIRMED → IN_PROGRESS → COMPLETED`; отмена (`CANCELLED`) возможна из
`NEW`, `CONFIRMED` и `IN_PROGRESS` (последний переход добавлен явно). Завершённые заказы
не редактируются; в архив попадают только `COMPLETED`/`CANCELLED`.
