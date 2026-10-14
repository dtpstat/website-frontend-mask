# Выкатка

Одна команда выкатывает на оба адреса:

```sh
./scripts/deploy.sh
```

Что делает:

1. `npm run build` — tsc + копирование статики в `dist/`;
2. Cloudflare Pages: `npx wrangler pages deploy dist --project-name dtpstat-pages` → <https://dtpstat-pages.pages.dev>;
3. rsync `dist/` на сервер `dtpstat` в `~/dtpstat-pages/dist/` — зеркало <https://ilia.dtp-stat.ru/map> (вхост отдаёт через симлинк `~/wp/map` → `dist`).

Требования: ключи Cloudflare/Mapbox/Яндекса в `.env` (см. `.env.example`), ssh-алиас `dtpstat`.

## Конфигурация (`dist/maps-config.js`)

Ключи карт и `API_ORIGIN` живут в `dist/maps-config.js` и **переживают сборку** — смена
`.env` не требует пересборки кода:

- локально: правка `.env` → `npm run config`;
- прод CF: правка `.env` → `./scripts/deploy.sh` (свежий конфиг уедет с деплоем);
- сервер ilia: правка одного файла `~/dtpstat-pages/maps-config.js` вне rsync (скрипт
  обязан нести `--exclude=maps-config.js` — на сервере конфиг лежит вне `dist/`,
  рядом симлинк `dist/maps-config.js` → `../maps-config.js`).

Внимание: вхост ilia отдаёт `.js` с `expires max` — правки конфига доходят до браузеров
только после `location = /map/maps-config.js { add_header Cache-Control "no-cache"; }`
в вхосте (нужен root).

## Зеркало frontend.dtp-stat.ru — этим скриптом НЕ обновляется

Вхост смотрит на `/var/www/dtp-stat.ru/dist` на сервере — клон этого репо под юзером
`dtpstat` (у `ilia` туда записи нет), свой `.env` c `API_ORIGIN=https://new.dtp-stat.ru`.
Фронтенд живёт в корне (пути `/map/` там нет). Обновлять из-под юзера `dtpstat`
(`git pull && npm run build`) или через админа, иначе домен отстанет от pages.dev.

## Проверка после выкатки

```sh
curl -4 -o /dev/null -w '%{http_code}\n' https://dtpstat-pages.pages.dev/
curl -4 -o /dev/null -w '%{http_code}\n' https://ilia.dtp-stat.ru/map/
```
