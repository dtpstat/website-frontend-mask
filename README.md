# Карта ДТП — статический фронтенд

Статический фронтенд карты ДТП: ванильный TypeScript без бандлера (`tsc` → `dist/`).
Главная карта, индивидуальные страницы ДТП (`details/`), блог, данные, о проекте.
Данные читаются AJAX-запросами к API (Express + PostGIS).

## Сборка и проверки

    npm install
    npm run build   # tsc → dist/, копировка статики, генерация dist/maps-config.js
    npm run check   # tsc --noEmit
    npm run serve   # локальный сервер: раздаёт dist/ и проксирует /api

Ключи карт задаются в `.env` (`YANDEX_MAPS_KEY`, `MAPBOX_ACCESS_TOKEN`): на сборке они
попадают в `dist/maps-config.js`, который подключается в HTML до `app.js`. В репозитории
ключей нет.

## Деплой

Cloudflare Pages, direct upload:

    npx wrangler pages deploy dist --project-name dtpstat-pages
