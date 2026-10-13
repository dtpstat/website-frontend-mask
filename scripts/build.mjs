// Сборка dist/: rm dist, tsc, копирует статику из pages/, обновляет maps-config.js.
// dist/maps-config.js — конфиг развёртывания (ключи карт, origin бэкенда): правится
// на месте без пересборки, сборка его не перетирает; пересоздать из .env — npm run config.
// Запуск: npm run build  (= node --env-file=.env scripts/build.mjs)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const pages = join(root, "pages");
const config = join(dist, "maps-config.js");

// Конфиг из .env: подключается в html до app.js, задаёт
// window.YANDEX_MAPS_KEY / window.MAPBOX_ACCESS_TOKEN / window.API_ORIGIN
const mapsConfig = () =>
  "window.YANDEX_MAPS_KEY=" + JSON.stringify(process.env.YANDEX_MAPS_KEY || "") + ";" +
  "window.MAPBOX_ACCESS_TOKEN=" + JSON.stringify(process.env.MAPBOX_ACCESS_TOKEN || "") + ";" +
  "window.API_ORIGIN=" + JSON.stringify(process.env.API_ORIGIN || "") + ";";

// npm run config — пересоздать только конфиг из .env, статику не трогать
if (process.argv.includes("--config-only")) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(config, mapsConfig());
  console.log("dist/maps-config.js пересоздан из .env");
  process.exit(0);
}

// Конфиг переживает пересборку: существующий сохраняется, новый создаётся только на пустом dist
const kept = existsSync(config) ? readFileSync(config, "utf8") : null;
rmSync(dist, { recursive: true, force: true });
const tsc = spawnSync("tsc", { stdio: "inherit" });
if (tsc.status) process.exit(tsc.status);
mkdirSync(dist, { recursive: true });
// pages/main/* — главная карта, ложится в корень dist (index.html, styles.css, mapbox.css);
// остальные каталоги pages/<name> — подстраницы, копируются целиком как dist/<name>
for (const name of readdirSync(pages)) {
  if (name === "main") cpSync(join(pages, "main"), dist, { recursive: true });
  else cpSync(join(pages, name), join(dist, name), { recursive: true });
}
if (kept !== null) {
  writeFileSync(config, kept);
  console.log("dist assembled (maps-config.js сохранён; пересоздать из .env — npm run config)");
} else {
  writeFileSync(config, mapsConfig());
  console.log("dist assembled");
}
