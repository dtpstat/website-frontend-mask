// Территория под центром карты: эндпоинт /geom/getRegionUnderPoint (lat, lng, level = OSM
// admin_level) возвращает name админ-единицы под центром — подпись живёт в карточке
// статистики (#region-plate), серой строкой под ней родитель (#region-parent) с того же
// эндпоинта на более грубом уровне. Видимая строка подписи — ещё и «место» счётчиков
// (state.place): её геометрия фильтрует набор региона. Fetch мимо apiFetch, чтобы каждый
// пан не мигал полоской загрузки. Уровень подписи из зума: с зума дэшборда — 4 регион
// (совпадает с данными счётчиков), 11-13 → 6 округ, 14+ → 8 район города. Таблица
// покрыта только Россией — вне её name пустой

import { api, $, state, regionName, actions } from "./context.js";
import { currentView } from "./maps.js";
import { regionAtCenter, makePlace } from "./territory.js";

// Кэш ответов по ячейкам: размер ячейки в градусах на admin-level (в fetch идут те же
// округлённые координаты, что в ключе). Кэшируются и пустые имена — центр вне России
const regionCell: Record<number, number> = { 2: 2, 4: 0.1, 6: 0.1, 8: 0.02 };
// Родитель подписи: у района/округа — субъект, у субъекта — страна
const parentLevel: Record<number, number> = { 4: 2, 6: 4, 8: 4 };
const regionCache = new Map<string, { name: string; geometry: any }>();
let regionKey = "", regionSeq = 0, regionTimer = 0, regionAbort: AbortController | null = null;

function scheduleRegionLookup(delay = 250) { clearTimeout(regionTimer); regionTimer = setTimeout(lookupRegion, delay); }

// Ячейка кэша своего уровня: ключ и те же округлённые координаты для fetch
function cellKey(level: number, latitude: number, longitude: number) {
  const cell = regionCell[level];
  const lat = (Math.round(latitude / cell) * cell).toFixed(3), lng = (Math.round(longitude / cell) * cell).toFixed(3);
  return { lat, lng };
}

// Координаты уже округлены до ячейки ПОДПИСИ: родитель спрашиваем по тем же координатам —
// ячейка родительского уровня в 10 раз крупнее и отвечала бы за соседний район.
// В кэше пара имя+геометрия: место счётчиков строится из геометрии и на кэш-хите
// должно пересоздаваться так же, как на свежем ответе
async function lookupName(level: number, lat: string, lng: string) {
  const key = `${level}|${lat}|${lng}`;
  const cached = regionCache.get(key);
  if (cached !== undefined) return cached;
  const response = await fetch(`${api}/geom/getRegionUnderPoint?lat=${lat}&lng=${lng}&level=${level}`, { signal: regionAbort!.signal });
  if (!response.ok) throw new Error("region lookup failed");
  const data = await response.json();
  const entry = { name: String(data?.properties?.name || ""), geometry: data?.geometry ?? null };
  if (regionCache.size >= 40) regionCache.delete(regionCache.keys().next().value);
  regionCache.set(key, entry);
  return entry;
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
    const [plate, parentPlace] = await Promise.all([lookupName(level, lat, lng), lookupName(parent, lat, lng)]);
    if (loadId !== regionSeq) return;
    await applyRegion(plate, parentPlace.name, level);
  } catch (error) {
    if (loadId === regionSeq && (error as Error).name !== "AbortError") regionKey = ""; // сбой — подпись не трогаем, повторим на следующем ходе
  }
}

// Подпись и родитель дублируют заголовок карточки, когда называют тот же субъект:
// без закрепления подпись уровня 4 всегда и есть регион данных, а родитель района —
// тем более. Оформные слова не мешают сравнению («г. Москва» = «Москва», «Республика
// Татарстан» = «Татарстан»); остаются только новые строки — район и страна
const subjectKey = (name: string) => name.toLowerCase().replace(/^(г\.\s*|республика\s+|\S+\s+республика$)/, "").trim();
const duplicates = (candidate: string, name: string) => Boolean(candidate) && Boolean(name) && subjectKey(candidate) === subjectKey(name);

// Видимая строка подписи — «место» счётчиков и графика: по нему фильтруется набор
// региона. Считаем по месту, только когда оно внутри набора данных: без закрепления
// это всегда так (подпись и регион — один субъект), с закреплением — пока центр не
// выехал из закреплённого субъекта (там подпись чужая, а данные остаются закреплёнными).
// Место — география: живёт до следующего вызова applyRegion (смена периода/фильтров
// пересчитывает те же точки, движка карты не требует; иначе подпись осталась бы,
// а счётчики молча переехали бы на весь регион)
async function applyRegion(plate: { name: string; geometry: any }, parentName: string, level: number) {
  const plateNode = ($("#region-plate") as HTMLElement), parent = ($("#region-parent") as HTMLElement);
  const name = plate.name;
  const title = state.territory?.name ?? regionName(state.dataRegion);
  const plateVisible = Boolean(name) && !((level === 4 && !state.territory) || duplicates(name, title));
  plateNode.textContent = name;
  plateNode.hidden = !plateVisible;
  // Родитель виден, пока есть подпись: на уровне 4 он остаётся виден и при скрытой
  // подписи-дубле («г. Москва» / «Россия»), на уровнях 6/8 сам дублирует заголовок
  parent.textContent = parentName;
  parent.hidden = !name || !parentName || duplicates(parentName, title) || duplicates(parentName, name) || (level !== 4 && !state.territory);
  const within = plateVisible && plate.geometry && (!state.territory || (await regionAtCenter(currentView().center.latitude, currentView().center.longitude)) === state.territory.id);
  const next = within ? makePlace(name, plate.geometry) : null;
  // Геометрия и имя приезжают одним ответом — имя меняется только вместе с местом
  const changed = (state.place?.name ?? null) !== (next?.name ?? null);
  state.place = next;
  if (changed) actions.refreshRender(); // место доехало позже данных — пересчитать счётчики и график
}

export { scheduleRegionLookup };
