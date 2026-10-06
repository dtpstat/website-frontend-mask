// Территория под центром карты: эндпоинт /geom/getRegionUnderPoint (lat, lng, level = OSM
// admin_level) возвращает name админ-единицы под центром — подпись живёт в карточке
// статистики (#region-plate). Чисто информационно: на state.territory, фильтры и загрузку
// данных не влияет; fetch мимо apiFetch, чтобы каждый пан не мигал полоской загрузки.
// Уровень из зума — маппинг старого сайта (0-6 → 2 страна, 7-10 → 4 регион, 11-13 → 6
// округ, 14+ → 8 район города). Таблица покрыта только Россией — вне её name пустой

import { api, $ } from "./context.js";
import { currentView } from "./maps.js";

// Кэш ответов по ячейкам: размер ячейки в градусах на admin-level (в fetch идут те же
// округлённые координаты, что в ключе). Кэшируются и пустые имена — центр вне России
const regionCell: Record<number, number> = { 2: 2, 4: 0.5, 6: 0.1, 8: 0.02 };
const regionCache = new Map<string, string>();
let regionKey = "", regionSeq = 0, regionTimer = 0, regionAbort: AbortController | null = null;

function scheduleRegionLookup(delay = 250) { clearTimeout(regionTimer); regionTimer = setTimeout(lookupRegion, delay); }

async function lookupRegion() {
  const view = currentView();
  const level = view.zoom <= 6 ? 2 : view.zoom <= 10 ? 4 : view.zoom <= 13 ? 6 : 8;
  const cell = regionCell[level];
  const lat = (Math.round(view.center.latitude / cell) * cell).toFixed(3), lng = (Math.round(view.center.longitude / cell) * cell).toFixed(3);
  const key = `${level}|${lat}|${lng}`;
  if (key === regionKey) return;
  regionKey = key;
  const cached = regionCache.get(key);
  if (cached !== undefined) { applyRegion(cached); return; }
  const loadId = ++regionSeq;
  regionAbort?.abort(); regionAbort = new AbortController();
  try {
    const response = await fetch(`${api}/geom/getRegionUnderPoint?lat=${lat}&lng=${lng}&level=${level}`, { signal: regionAbort.signal });
    if (!response.ok) throw new Error("region lookup failed");
    const name = String((await response.json())?.properties?.name || "");
    if (loadId !== regionSeq) return;
    if (regionCache.size >= 40) regionCache.delete(regionCache.keys().next().value);
    regionCache.set(key, name);
    applyRegion(name);
  } catch (error) {
    if (loadId === regionSeq && (error as Error).name !== "AbortError") regionKey = ""; // сбой — подпись не трогаем, повторим на следующем ходе
  }
}

function applyRegion(name: string) {
  const plate = ($("#region-plate") as HTMLElement);
  if (plate.textContent === name) return;
  plate.textContent = name;
  plate.hidden = !name;
}

export { scheduleRegionLookup };
