// Территория под центром карты: эндпоинт /geom/getRegionUnderPoint (lat, lng, level = OSM
// admin_level) возвращает name админ-единицы под центром — подпись живёт в карточке
// статистики (#region-plate), серой строкой под ней родитель (#region-parent) с того же
// эндпоинта на более грубом уровне. Чисто информационно: на state.territory, фильтры и
// загрузку данных не влияет; fetch мимо apiFetch, чтобы каждый пан не мигал полоской загрузки.
// Уровень подписи из зума: с зума дэшборда — 4 регион (совпадает с данными счётчиков),
// 11-13 → 6 округ, 14+ → 8 район города. Таблица покрыта только Россией — вне её name пустой

import { api, $ } from "./context.js";
import { currentView } from "./maps.js";

// Кэш ответов по ячейкам: размер ячейки в градусах на admin-level (в fetch идут те же
// округлённые координаты, что в ключе). Кэшируются и пустые имена — центр вне России
const regionCell: Record<number, number> = { 2: 2, 4: 0.1, 6: 0.1, 8: 0.02 };
// Родитель подписи: у района/округа — субъект, у субъекта — страна
const parentLevel: Record<number, number> = { 4: 2, 6: 4, 8: 4 };
const regionCache = new Map<string, string>();
let regionKey = "", regionSeq = 0, regionTimer = 0, regionAbort: AbortController | null = null;

function scheduleRegionLookup(delay = 250) { clearTimeout(regionTimer); regionTimer = setTimeout(lookupRegion, delay); }

// Ячейка кэша своего уровня: ключ и те же округлённые координаты для fetch
function cellKey(level: number, latitude: number, longitude: number) {
  const cell = regionCell[level];
  const lat = (Math.round(latitude / cell) * cell).toFixed(3), lng = (Math.round(longitude / cell) * cell).toFixed(3);
  return { lat, lng };
}

// Координаты уже округлены до ячейки ПОДПИСИ: родитель спрашиваем по тем же координатам —
// ячейка родительского уровня в 10 раз крупнее и отвечала бы за соседний район
async function lookupName(level: number, lat: string, lng: string) {
  const key = `${level}|${lat}|${lng}`;
  const cached = regionCache.get(key);
  if (cached !== undefined) return cached;
  const response = await fetch(`${api}/geom/getRegionUnderPoint?lat=${lat}&lng=${lng}&level=${level}`, { signal: regionAbort!.signal });
  if (!response.ok) throw new Error("region lookup failed");
  const name = String((await response.json())?.properties?.name || "");
  if (regionCache.size >= 40) regionCache.delete(regionCache.keys().next().value);
  regionCache.set(key, name);
  return name;
}

async function lookupRegion() {
  const view = currentView();
  // Ниже зума 6 карточка скрыта гейтом конвейера — подписи не нужны
  if (view.zoom < 6) return;
  const level = view.zoom <= 10 ? 4 : view.zoom <= 13 ? 6 : 8;
  const parent = parentLevel[level];
  const { lat, lng } = cellKey(level, view.center.latitude, view.center.longitude);
  const key = `${level}|${lat}|${lng}+${parent}`;
  if (key === regionKey) return;
  regionKey = key;
  const loadId = ++regionSeq;
  regionAbort?.abort(); regionAbort = new AbortController();
  try {
    const [name, parentName] = await Promise.all([lookupName(level, lat, lng), lookupName(parent, lat, lng)]);
    if (loadId !== regionSeq) return;
    applyRegion(name, parentName);
  } catch (error) {
    if (loadId === regionSeq && (error as Error).name !== "AbortError") regionKey = ""; // сбой — подпись не трогаем, повторим на следующем ходе
  }
}

function applyRegion(name: string, parentName: string) {
  const plate = ($("#region-plate") as HTMLElement), parent = ($("#region-parent") as HTMLElement);
  if (plate.textContent === name && parent.textContent === parentName) return;
  plate.textContent = name;
  plate.hidden = !name;
  // Родитель виден только при живой подписи: серая строка под ней
  parent.textContent = parentName;
  parent.hidden = !name || !parentName;
}

export { scheduleRegionLookup };
