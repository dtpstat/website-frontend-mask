// Территория под центром карты: эндпоинт /geom/getRegionUnderPoint (lat, lng, level = OSM
// admin_level) возвращает name админ-единицы под центром. Место (state.place) — самое
// конкретное из ответов (с зума дэшборда: 11-13 → 6 округ, 14+ → 8 район города): его
// имя становится заголовком карточки (#region-name у pipeline), а геометрия фильтрует
// набор региона для счётчиков; серой строкой под заголовком pipeline показывает регион
// данных (#region-plate), ещё строкой ниже — родитель (#region-parent) с того же
// эндпоинта на более грубом уровне. Fetch мимо apiFetch, чтобы каждый пан не мигал
// полоской загрузки. Таблица покрыта только Россией — вне её name пустой

import { api, $, state, actions } from "./context.js";
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
  // Под замком место под центром не определяем: контекст карточки — закреплённый субъект
  if (state.territory) { showResolving(false); return; }
  // Ниже зума 6 карточка скрыта гейтом конвейера — подписи не нужны
  if (view.zoom < 6) { showResolving(false); return; }
  const level = view.zoom <= 10 ? 4 : view.zoom <= 13 ? 6 : 8;
  const parent = parentLevel[level];
  const { lat, lng } = cellKey(level, view.center.latitude, view.center.longitude);
  const key = `${level}|${lat}|${lng}+${parent}`;
  if (key === regionKey) return;
  regionKey = key;
  showResolving(level !== 4); // место будет только у округа/района — на уровне субъекта не обещаем
  const loadId = ++regionSeq;
  regionAbort?.abort(); regionAbort = new AbortController();
  try {
    const [plate, parentPlace] = await Promise.all([lookupName(level, lat, lng), lookupName(parent, lat, lng)]);
    if (loadId !== regionSeq) return;
    await applyRegion(plate, parentPlace.name, level);
  } catch (error) {
    if (loadId === regionSeq && (error as Error).name !== "AbortError") { regionKey = ""; showResolving(false); } // сбой — подпись не трогаем, повторим на следующем ходе
  }
}

// Лоадер резолва места: строка под регионом в карточке. Показывается на время каждого
// лукапа уровня округа/района (geom на тяжёлых полигонах отвечает до 4.5с), прячется
// ответом/сбоем. Кэш-хит проходит тот же путь синхронно — вспышки не будет
function showResolving(visible: boolean) { ($("#region-resolving") as HTMLElement).hidden = !visible; }

// Место — самая конкретная строка подписи и «место» счётчиков: по нему фильтруется
// набор региона, его имя встаёт в заголовок карточки. Место есть только у округа/района
// (уровни 6/8): подпись уровня 4 — сам субъект данных, считать по нему нечего. Считаем
// по месту, только когда оно внутри набора данных: без закрепления это всегда так,
// с закреплением — пока центр не выехал из закреплённого субъекта (там подпись чужая,
// а данные остаются закреплёнными). Место — география: живёт до следующего вызова
// applyRegion (смена периода/фильтров пересчитывает те же точки, движка карты не
// требует; иначе заголовок остался бы, а счётчики молча переехали бы на весь регион)
async function applyRegion(plate: { name: string; geometry: any }, parentName: string, level: number) {
  showResolving(false);
  const parent = ($("#region-parent") as HTMLElement);
  const name = plate.name;
  const within = Boolean(name) && plate.geometry && level !== 4 && (!state.territory || (await regionAtCenter(currentView().center.latitude, currentView().center.longitude)) === state.territory.id);
  const next = within ? makePlace(name, plate.geometry) : null;
  // Родитель — контекст подписи уровня 4 (страна под субъектом); у округа/района
  // его роль берёт строка региона данных (#region-plate у pipeline)
  parent.textContent = parentName;
  parent.hidden = !name || !parentName || level !== 4;
  // Геометрия и имя приезжают одним ответом — имя меняется только вместе с местом
  const changed = (state.place?.name ?? null) !== (next?.name ?? null);
  state.place = next;
  if (changed) actions.refreshRender(); // место доехало позже данных — пересчитать счётчики и график
}

// Замок: прибить текущий лукап (ответ не должен перезаписать подпись после
// закрепления) и спрятать лоадер с родительской строкой — место больше не ищется
function cancelRegionLookup() {
  regionSeq++;
  regionAbort?.abort(); regionAbort = new AbortController();
  regionKey = "";
  showResolving(false);
  ($("#region-parent") as HTMLElement).hidden = true;
}

export { scheduleRegionLookup, cancelRegionLookup };
