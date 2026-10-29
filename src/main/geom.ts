// Территория под центром карты: эндпоинт /geom/getRegionUnderPoint (lat, lng, level = OSM
// admin_level) возвращает name админ-единицы под центром. Место (state.place) — самое
// конкретное из ответов (с зума дэшборда: 11-13 → 6 округ, 14+ → 8 район города): его
// имя становится заголовком карточки (#region-name у pipeline), а геометрия фильтрует
// набор региона для счётчиков; серой строкой под заголовком pipeline показывает регион
// данных (#region-plate), ещё строкой ниже — родитель (#region-parent) с того же
// эндпоинта на уровне страны. Каждый ход карты, сменивший центр (пан или зум к курсору),
// перепроверяет место: счётчики считаются по месту, промах ячейки здесь = чужие числа.
// Fetch мимо apiFetch, чтобы каждый пан не мигал полоской загрузки. Таблица покрыта
// только Россией — вне её name пустой

import { api, $, state, actions } from "./context.js";
import { currentView, flushPlaceMaskHold, renderHeatControls } from "./maps.js";
import { regionAtCenter, makePlace, applyTerritoryMask } from "./territory.js";

// Кэш ответов по точкам (координаты, округлённые до 0.001° ≈ 50 м — заодно дедуп
// дрожащего центра). Кэшируются и пустые имена — центр вне России
const regionCache = new Map<string, { name: string; geometry: any }>();
// Родитель подписи: только у субъекта — страна (у округа/района его роль берёт строка региона)
const parentLevel: Record<number, number> = { 4: 2 };
let regionKey = "", regionSeq = 0, regionTimer = 0, regionAbort: AbortController | null = null;
// Ячейка, чья геометрия уже в маске: та же ячейка = те же кольца, перерисовки нет
let maskKey = "";

function scheduleRegionLookup(delay = 250) { clearTimeout(regionTimer); regionTimer = setTimeout(lookupRegion, delay); }

// Точные координаты центра: ключ дедупа и те же координаты для fetch
function centerKey(latitude: number, longitude: number) {
  return { lat: latitude.toFixed(3), lng: longitude.toFixed(3) };
}

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
  // Ниже зума 6 карточка скрыта гейтом конвейера — подписи не нужны, затемнение
  // без адреса на общепланетном зуме тоже не имеет смысла. regionKey забываем вместе
  // с кольцами: иначе возврат в ту же ячейку решит по дедупу, что место «живо», и
  // маска после зума наружу/обратно не вернётся (кольца-то стёрты)
  if (view.zoom < 6) { showResolving(false); regionKey = ""; resetPlaceMask(); return; }
  // Под замком место под центром не определяем: контекст карточки — закреплённый
  // субъект. Кольца после сброса (гейт выше, замок на общем зуме) восстанавливаем
  // сами — лукапа при замке не будет: место в карточке, затемнение обязано ему
  // соответствовать (живое место — его кольцами, без него — субъектом)
  if (state.territory) { applyTerritoryMask(); showResolving(false); flushPlaceMaskHold(); return; }
  const level = view.zoom <= 10 ? 4 : view.zoom <= 13 ? 6 : 8;
  const { lat, lng } = centerKey(view.center.latitude, view.center.longitude);
  const key = `${level}|${lat}|${lng}`;
  // Дедуп пропускает ход, только если место по этому ключу живо: стёртое место
  // (смена замка) должно пере-примениться повторным лукапом — из кэша, без запроса.
  // Ответа не будет, но маска после зума ждёт именно его — снимаем ожидание сами
  if (key === regionKey && state.place) { flushPlaceMaskHold(); return; }
  regionKey = key;
  showResolving(level !== 4); // место будет только у округа/района — на уровне субъекта не обещаем
  const loadId = ++regionSeq;
  regionAbort?.abort(); regionAbort = new AbortController();
  try {
    const plate = await lookupName(level, lat, lng);
    if (loadId !== regionSeq) return;
    await applyRegion(plate, level, key);
    // Родитель нужен только подписи уровня субъекта (страна) — и он не должен задерживать
    // место: субъект-plate уже в applyRegion, страна доедет следом. Сбой молча: строка не критична
    const parent = parentLevel[level];
    if (parent) lookupName(parent, lat, lng).then((parentPlace) => {
      if (loadId !== regionSeq) return;
      const parentEl = ($("#region-parent") as HTMLElement);
      parentEl.textContent = parentPlace.name;
      parentEl.hidden = !plate.name || !parentPlace.name;
    }).catch(() => {});
  } catch (error) {
    // Сбой — подпись не трогаем, повторим на следующем ходе; маску возвращаем прежней —
    // ждать ответа, который не приедет, хуже, чем показать старую геометрию
    if (loadId === regionSeq && (error as Error).name !== "AbortError") { regionKey = ""; showResolving(false); flushPlaceMaskHold(); }
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
async function applyRegion(plate: { name: string; geometry: any }, level: number, key: string) {
  showResolving(false);
  const name = plate.name;
  // Субъект под центром нужен дважды: для проверки закрепления и в самом месте —
  // место запоминает свой регион, и renderMapData отличает по нему место чужого
  // набора (точки соседнего региона приехали, а место ещё летит старое): в этом
  // окне счётчики показывают «—», а не ложный ноль по чужому клипу
  const center = regionAtCenter(currentView().center.latitude, currentView().center.longitude).catch(() => null);
  const within = Boolean(name) && plate.geometry && level !== 4 && (!state.territory || (await center) === state.territory.id);
  const next = within ? makePlace(name, plate.geometry, await center) : null;
  // На уровнях округа/района родительской строки нет — её роль берёт строка региона
  // данных (#region-plate у pipeline); строку страны под субъектом покажет ответ родителя
  if (level !== 4) ($("#region-parent") as HTMLElement).hidden = true;
  // Геометрия и имя приезжают одним ответом — место меняется только целиком: имя или
  // регион (одноимённые районы соседних субъектов — тоже смена, клип и счётчики другие)
  const changed = (state.place?.name ?? null) !== (next?.name ?? null) || (state.place?.region ?? null) !== (next?.region ?? null);
  state.place = next;
  // Кольца маски обновляем ДО refreshRender: рендеры карт внутри перерисовывают и
  // маску — со старыми кольцами она моргнула бы перед новыми. Маска затемнения —
  // геометрия подписи на любом уровне: на уровне субъекта место счётчиков не строится
  // (весь набор региона и так субъект), но затемнить снаружи субъекта нужно так же,
  // как вокруг округа/района. Перерисовка — по смене ячейки: в её пределах ответ тот
  // же (кэш), гонять растушёвку на каждый пан не нужно
  if (maskKey !== key) {
    maskKey = key;
    state.maskRings = next ? next.rings : name && plate.geometry ? makePlace(name, plate.geometry).rings : [];
    // Ползунки затемнения — по факту колец: рендер данных может ехать долго (точки
    // большого набора), а маска уже сменилась
    renderHeatControls();
  }
  // Место доехало — пересчитать счётчики и график: чужое место по новому набору
  // держало «—» (placeAlien), совпадение региона ожидание снимает
  if (changed) actions.refreshRender();
  flushPlaceMaskHold(); // ответ лукапа приехал — маску после зума можно рисовать
}

// Замок: прибить текущий лукап (ответ не должен перезаписать подпись после
// закрепления) и спрятать лоадер с родительской строкой — место больше не ищется
function cancelRegionLookup() {
  regionSeq++;
  regionAbort?.abort(); regionAbort = new AbortController();
  regionKey = "";
  showResolving(false);
  ($("#region-parent") as HTMLElement).hidden = true;
  // Маску здесь не трогаем: ручной замок закрепляет место вместе с затемнением,
  // а сброс случится в updateTerritoryCard при смене состояния замка
}

// Сброс маски извне (гейт зума здесь, смена замка в territory): ячейка забывается,
// иначе следующий лукап по той же ячейке решит, что геометрия всё ещё в маске
function resetPlaceMask() {
  maskKey = "";
  state.maskRings = [];
  flushPlaceMaskHold(true);
}

export { scheduleRegionLookup, cancelRegionLookup, resetPlaceMask };
