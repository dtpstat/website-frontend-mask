# Карта ДТП — статический фронтенд

Статический фронтенд карты ДТП: ванильный TypeScript без бандлера (`tsc` → `dist/`).
Главная карта, индивидуальные страницы ДТП (`details/`), блог, данные, о проекте.
Данные читаются AJAX-запросами к API; бэкенд (Express + PostGIS) —
[dtpstat-map](https://github.com/dtpstat/dtpstat-map), его адрес задаётся в `.env`
(см. `.env.example`).

## Сборка и проверки

    npm install
    npm run build   # tsc → dist/, копировка статики, dist/maps-config.js (см. ниже)
    npm run check   # tsc --noEmit
    npm run serve   # локальный сервер: раздаёт dist/ и проксирует /api
    npm run config  # пересоздать dist/maps-config.js из .env без пересборки
    npm run test:mobile  # e2e панелей фильтров (мобайл 390/320 + десктоп-санити); нужны build, Chrome и бэкенд

Конфиг развёртывания — отдельный файл `dist/maps-config.js`, подключаемый в HTML до `app.js`:
`YANDEX_MAPS_KEY`, `MAPBOX_ACCESS_TOKEN`, `API_ORIGIN` (origin бэкенда; шаблон — `.env.example`).
Без `API_ORIGIN` страница ходит на `/api` того же origin: локально его проксирует serve-скрипт,
на своём домене — nginx (см. «Самостоятельный хостинг»). В репозитории ключей нет.

Файл правится на месте **без пересборки** — `npm run build` его не перетирает. Пересоздать
из `.env` целиком: `npm run config` (первый конфиг на пустом `dist/` создаётся сборкой
автоматически). После правки конфига выкатывать заново всю статику не нужно — только
изменённый файл (см. «Обновление» ниже).

## Деплой

Cloudflare Pages и SSH-зеркало настраиваются в локальном `.env`:
`DTP_CF_PAGES_PROJECT`, `DTP_CF_PAGES_URL`,
`DTP_MIRROR_TARGET`, `DTP_MIRROR_URL`. Деплой обеих целей:

    ./scripts/deploy.sh

Скрипт читает `.env` через Node.js и проверяет параметры до запуска.
Подробности: [DEPLOY.md](DEPLOY.md). Изменение только клиентского
конфига (ключей карт, `API_ORIGIN`) не требует пересборки исходников:
`npm run config` обновит `dist/maps-config.js`; опубликование
обновлённого файла выполняется отдельно.

### Самостоятельный хостинг (статика + nginx)

`dist/` — самодостаточная статика (HTML/CSS/JS + ассеты), серверного кода нет.
Клиентской маршрутизации тоже нет: все deep-links передаются query-параметрами
(`?region=`, `?popup=`), поэтому SPA-fallback не нужен — хватает
`try_files $uri $uri/ =404`. Подойдёт любой статический сервер; ниже — nginx.

1. Собрать статику (ключи карт и `API_ORIGIN` пишутся в `dist/maps-config.js`):

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

            # Конфиг правится без пересборки — браузеры должны забирать его свежим,
            # поэтому из долгого кэша его исключаем (точный location бьёт regex-правило)
            location = /maps-config.js {
                add_header Cache-Control "no-cache";
            }

            # HTML всегда свежий, чтобы новые ?v= подхватывались сразу
            location ~* \.html$ {
                add_header Cache-Control "no-cache";
            }

            location / { try_files $uri $uri/ =404; }
        }

   Если бэкенд отвечает по HTTPS не на localhost (например, на отдельном домене),
   добавьте в `location /api/` `proxy_ssl_server_name on;` и
   `proxy_set_header Host <домен бэкенда>;`.

   Важно: `?v=` в ссылках на JS/CSS бампается вручную в `pages/main/index.html`
   перед сборкой — без нового `?v=` браузеры возьмут старые файлы из кэша.

4. Обновление. Статика и конфиг обновляются независимо:

        # новая статика (конфиг на сервере не трогаем — исключаем из rsync)
        npm run build
        rsync -r --delete --exclude=maps-config.js dist/ www@server:/var/www/dtpstat-pages/dist/

        # смена конфига (ключи, API_ORIGIN) — без пересборки, одним файлом:
        # поправить maps-config.js на сервере и скопировать его отдельно
        scp dist/maps-config.js www@server:/var/www/dtpstat-pages/dist/

   Удобно держать конфиг вне `dist/` (например, `/var/www/dtpstat-pages/maps-config.js`)
   и симлинком внутрь: `ln -sfn ../maps-config.js dist/maps-config.js`. Тогда конфиг
   вообще не живёт в раздаваемом дереве, и `--exclude` в rsync страхует симлинк
   от удаления. Ключи карт после правки не требуют ничего, кроме перезагрузки
   страницы посетителем.

Блог наполняется командой `npm run sync:blog` (источник — `BLOG_SOURCE_ORIGIN` в `.env`; загрузка материалов внешнего WP). Ранее использовался `scripts/sync-blog.mjs` (тянет посты со старого WP-сайта
и складывает ассеты в `pages/blog/assets/`); запустите его перед сборкой, если нужен
актуальный блог, — в рантайме внешний WP не используется.
