#!/bin/sh
# Деплой фронтенда: сборка → Cloudflare Pages → зеркало на dtpstat (~/dtpstat-pages/dist;
# сейчас оно ничем не раздаётся — карта нового сайта айфреймит frontend.dtp-stat.ru,
# см. INFRASTRUCTURE.md мета-репо).
# Конфиг (ключи карт, API_ORIGIN) в деплой не зашит: dist/maps-config.js переживает сборку,
# на сервере живёт вне dist (~/dtpstat-pages/maps-config.js + симлинк), rsync его не трогает.
# Смена ключей без пересборки: локально «npm run config» + повторный деплой,
# на сервере — правка ~/dtpstat-pages/maps-config.js (см. README «Конфигурация»).
set -e
cd "$(dirname "$0")/.."
npm run build
npx wrangler pages deploy dist --project-name dtpstat-pages
rsync -az --delete --exclude=maps-config.js -e "ssh -o BatchMode=yes" dist/ dtpstat:dtpstat-pages/dist/
echo "Прод: https://dtpstat-pages.pages.dev и https://ilia.dtp-stat.ru/map/"
