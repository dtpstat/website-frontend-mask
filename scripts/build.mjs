// Сборка dist/ после tsc: копирует статику из pages/ и генерирует maps-config.js из переменных окружения.
// Запуск: npm run build  (= rm -rf dist && tsc && node --env-file=.env scripts/build.mjs)
import { cpSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const pages = join(root, "pages");

mkdirSync(dist, { recursive: true });
// pages/main/* — главная карта, ложится в корень dist (index.html, styles.css, mapbox.css);
// остальные каталоги pages/<name> — подстраницы, копируются целиком как dist/<name>
for (const name of readdirSync(pages)) {
  if (name === "main") cpSync(join(pages, "main"), dist, { recursive: true });
  else cpSync(join(pages, name), join(dist, name), { recursive: true });
}
// Ключи карт: подключаются в html до app.js как window.YANDEX_MAPS_KEY / window.MAPBOX_ACCESS_TOKEN
writeFileSync(join(dist, "maps-config.js"),
  "window.YANDEX_MAPS_KEY=" + JSON.stringify(process.env.YANDEX_MAPS_KEY || "") + ";" +
  "window.MAPBOX_ACCESS_TOKEN=" + JSON.stringify(process.env.MAPBOX_ACCESS_TOKEN || "") + ";");
console.log("dist assembled");
