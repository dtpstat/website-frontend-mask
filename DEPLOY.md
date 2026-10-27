# Развёртывание статического фронтенда

`scripts/deploy.sh` публикует собранный `dist/` в Cloudflare Pages
и копирует статику на SSH-зеркало через rsync. **Ни один публичный адрес
или адрес назначения больше не зашит в скрипт.** Они берутся из `.env`.

## Конфигурация

Скопируйте `.env.example` в локальный `.env` и заполните значения.
`.env` не коммитится; публикационные параметры не попадают в
`dist/maps-config.js`:

```dotenv
# Публичные параметры публикации:
DTP_CF_PAGES_PROJECT=dtpstat-pages
DTP_CF_PAGES_URL=https://dtpstat-pages.pages.dev
DTP_MIRROR_TARGET=dtpstat:dtpstat-pages/dist/
DTP_MIRROR_URL=https://ilia.dtp-stat.ru/map/

# Параметры клиента:
YANDEX_MAPS_KEY=
MAPBOX_ACCESS_TOKEN=
API_ORIGIN=
```

`DTP_CF_PAGES_PROJECT` — **имя проекта** Cloudflare, не URL.
`DTP_CF_PAGES_URL` — URL для вывода ссылки после развёртывания.
`DTP_MIRROR_TARGET` — SSH-путь вида `user@host:path/`,
`DTP_MIRROR_URL` — публичный адрес этого зеркала.

`API_ORIGIN` относится к запросам фронтенда к API, а не к адресу
Cloudflare Pages. Ключи карт и `API_ORIGIN` управляют браузерным
`dist/maps-config.js`; значение из `.env` включается в него при
первой сборке и при `npm run config`. Уже существующий
`dist/maps-config.js` сохраняется при обычной сборке.

## Запуск

```sh
./scripts/deploy.sh
```

Скрипт через `node --env-file=.env` проверяет обязательные переменные
**до** запуска сборки и внешних команд, затем:

1. `npm run build`;
2. `npx wrangler pages deploy dist --project-name "$DTP_CF_PAGES_PROJECT"` (аргументы передаются непосредственно, без интерпретации shell);
3. `rsync -az --delete --exclude=maps-config.js` в `DTP_MIRROR_TARGET` по SSH.

**ВНИМАНИЕ:** rsync удаляет лишние файлы из директории зеркала, кроме
исключённого `maps-config.js`. Перед запуском проверяйте целевой каталог
и права SSH. Сам скрипт не делает резервную копию и не откатывает публикации.

Требуется Node.js с поддержкой `--env-file` (в проекте используется
Node ≥ 20.6), npm, npx/wrangler, rsync, SSH и учётные данные Cloudflare.

## Проверка

Проверьте GET каждого публичного URL, указанного в `.env`, и работу
карты в браузере; сообщение об успешном деплое не заменяет
HTTP-проверку.

Для проверки настроек **без публикации**:

```sh
node --test tests/deploy-settings.test.mjs
node --check scripts/deploy.mjs
sh -n scripts/deploy.sh
```

## Конфиг зеркала и альтернативное развёртывание

Если на сервере конфиг хранится отдельно (`~/dtpstat-pages/maps-config.js`)
и `dist/maps-config.js` — символическая ссылка на него, rsync не затронет
этот файл из-за `--exclude`. При изменении ключей правьте конфиг
сервера или копируйте его отдельно; учитывайте HTTP-кэш.

Этот скрипт **не обновляет** другие независимо развёрнутые фронтенды,
например `frontend.dtp-stat.ru`. Для них нужен собственный процесс
развёртывания и отдельная конфигурация API.
