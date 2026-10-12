# Карта ДТП — статический фронтенд

Статический фронтенд карты ДТП: ванильный TypeScript без бандлера (`tsc` → `dist/`).
Главная карта, индивидуальные страницы ДТП (`details/`), блог, данные, о проекте.
Данные читаются AJAX-запросами к API (Express + PostGIS).

## Сборка и проверки

    npm install
    npm run build   # tsc → dist/, копировка статики, генерация dist/maps-config.js
    npm run check   # tsc --noEmit
    npm run serve   # локальный сервер: раздаёт dist/ и проксирует /api
    npm run test:mobile  # e2e панелей фильтров (мобайл 390/320 + десктоп-санити); нужны build, Chrome и бэкенд

Ключи карт задаются в `.env` (`YANDEX_MAPS_KEY`, `MAPBOX_ACCESS_TOKEN`): на сборке они
попадают в `dist/maps-config.js`, который подключается в HTML до `app.js`. Там же задаётся
`API_ORIGIN` — origin бэкенда, вшиваемый в статику (шаблон — `.env.example`). Без него
страница ходит на `/api` того же origin: локально его проксирует serve-скрипт, на своём
домене — nginx (см. «Самостоятельный хостинг»). В репозитории ключей нет.

## Деплой

Cloudflare Pages, direct upload:

    npx wrangler pages deploy dist --project-name dtpstat-pages

### Самостоятельный хостинг (статика + nginx)

`dist/` — самодостаточная статика (HTML/CSS/JS + ассеты), серверного кода нет.
Клиентской маршрутизации тоже нет: все deep-links передаются query-параметрами
(`?region=`, `?popup=`), поэтому SPA-fallback не нужен — хватает
`try_files $uri $uri/ =404`. Подойдёт любой статический сервер; ниже — nginx.

1. Собрать статику (ключи карт вшиваются в `dist/maps-config.js`):

        npm install
        printf 'YANDEX_MAPS_KEY=…\nMAPBOX_ACCESS_TOKEN=…\n' > .env
        npm run build

   Ключи берутся в кабинете разработчика Яндекса (API Яндекс Карт, ограничение
   по Host/Referer) и в кабинете Mapbox (public token, URL restrictions). Они
   публичны по устройству клиента — любой посетитель видит их в браузере,
   поэтому ограничивайте их по домену в кабинетах.

2. Выбрать схему API (фронтенд читает `API_ORIGIN` из `maps-config.js`):

   - **Напрямую на бэкенд, без прокси** — оставить `API_ORIGIN` из `.env.example`
     (или указать другой публичный бэкенд): страница ходит на него в обход nginx
     (CORS на бэкенде открыт), на своём сервере ничего настраивать не нужно.
   - **Через nginx (same-origin, без CORS)** — оставить `API_ORIGIN` пустым
     (или задать свой домен `API_ORIGIN=https://map.example.ru`) и проксировать
     `/api/` на Express-бэкенд [geoJSON_dtp_API](https://github.com/dtpstat/dtpstat-map).

3. nginx (схема с прокси):

        server {
            listen 443 ssl;
            server_name map.example.ru;

            root /var/www/dtpstat-pages/dist;
            index index.html;

            gzip on;
            gzip_types text/css application/javascript image/svg+xml application/json;

            # API тем же origin (только для схемы с прокси)
            location /api/ {
                proxy_pass http://127.0.0.1:3100/api/;
                proxy_set_header Host $host;
            }

            # Версионированные ассеты (ссылки вида app.js?v=128) — кэш подлиннее
            location ~* \.(js|css|png|jpe?g|svg|woff2?)$ {
                expires 30d;
                add_header Cache-Control "public";
            }

            # HTML всегда свежий, чтобы новые ?v= подхватывались сразу
            location ~* \.html$ {
                add_header Cache-Control "no-cache";
            }

            location / { try_files $uri $uri/ =404; }
        }

   Вместо `127.0.0.1:3100` можно проксировать сразу на стенд
   `https://dtpstat-backend.7190805.xyz` — тогда добавьте в `location /api/`
   `proxy_ssl_server_name on;` и `proxy_set_header Host dtpstat-backend.7190805.xyz;`.

   Важно: `?v=` в ссылках на JS/CSS бампается вручную в `pages/main/index.html`
   перед сборкой — без нового `?v=` браузеры возьмут старые файлы из кэша.

4. Обновление — пересборка и rsync на сервер:

        npm run build
        rsync -r --delete dist/ www@server:/var/www/dtpstat-pages/dist/

Блог наполняется скриптом `scripts/sync-blog.mjs` (тянет посты со старого WP-сайта
и складывает ассеты в `pages/blog/assets/`); запустите его перед сборкой, если нужен
актуальный блог, — в рантайме внешний WP не используется.
