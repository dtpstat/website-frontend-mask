// Общий контекст приложения: состояние, утилиты DOM/API и реестр восходящих вызовов

// Origin API задаётся в .env (API_ORIGIN попадает в dist/maps-config.js); пусто/не задан —
// /api того же origin: локально его проксирует serve.mjs, на своём домене — nginx (см. README)
const api = ((window as any).API_ORIGIN || "") + "/api";
const $ = (selector) => document.querySelector(selector);
// Полоска загрузки в верхней строке — как на dtp-stat.ru: серые штрихи ползут, пока идёт
// хотя бы один запрос к бэкенду (статику не считаем). dtp-stat.ru держит счётчик loadingCount
// в сторе и вешает класс visible на .loader — здесь то же самое числом незакрытых запросов
let loadingJobs = 0;
const apiFetch = (input: string, init?: RequestInit) => {
  if (++loadingJobs === 1) $("#loader").classList.add("visible");
  return fetch(input, init).finally(() => {
    if (--loadingJobs === 0) $("#loader").classList.remove("visible");
  });
};
const dataRange = { min:"2015-01-01", max:"2026-08-31" };
type MapState = { language: string; mapClient: "leaflet" | "yandex" | "mapbox"; participants: any[]; filters: any[]; selectedFilters: Record<string, any[]>; selectedIntervals: Record<string, { from: string; to: string }>; territory: { id: number; name: string } | null; place: { name: string; rings: number[][][]; boxes: { west: number; south: number; east: number; north: number }[]; region: number | null } | null; maskRings: number[][][]; abort: AbortController | null; items: any[]; rawItems: any[]; rawItemsKey: string; dataLoadId: number; loadingId: number; placeAlien: boolean; chartMode: string; minDate: string; maxDate: string; dataRegion: number | null; outsideRegions: boolean; chartOpen: boolean };
type Bounds = { west: number; south: number; east: number; north: number };
const persistedMapClient = localStorage.getItem("map-client");
// По умолчанию — Яндекс (и на мобайле, и на десктопе); сохранённый выбор пользователя важнее дефолта
const state: MapState = { language: new URLSearchParams(location.search).get("lang") || localStorage.getItem("language") || "ru", mapClient: persistedMapClient === "mapbox" || persistedMapClient === "leaflet" ? persistedMapClient : "yandex", participants: [], filters: [], selectedFilters: {}, selectedIntervals: {}, territory: null, place: null, maskRings: [], abort: null, items: [], rawItems: [], rawItemsKey: "", dataLoadId: 0, loadingId: 0, placeAlien: false, chartMode: "days", minDate: "2015-01-01", maxDate: "2024-12-31", dataRegion: null, outsideRegions: false, chartOpen: false };
// Кэш загруженных точек: ключ запроса (период + фильтры) → ключ набора (регион или рамка) → точки.
// Новые наборы докачиваются по одному, уже скачанные не запрашиваются повторно.
const regionCache = new Map<string, Map<string, any[]>>();
// Названия видов ДТП из /dict/em_types — заполняется в loadFilters
const emTypeNames = new Map<number, string>();
function setStatus(message) { $("#filter-status").textContent = message; }
// Идёт ли запрос точек для актуального контекста: id ставится при старте загрузки
// и снимается её готовностью/ошибкой; прерванная загрузка своего флага не тратит —
// сравнение с dataLoadId делает флаг принадлежащим только свежей загрузке
const countsLoading = () => state.loadingId > 0 && state.loadingId === state.dataLoadId;
// Счётчики не могут быть посчитаны ещё и пока место чужое набору: числа клипаются
// местом, и старое место по новому набору даёт ложный ноль («0 ДТП — ЦАО» на наборе
// соседнего региона). Чужесть считает renderMapData — место знает свой субъект
// (place.region), набор знает свой (dataRegion); несовпадение = ждём лукап наравне
// с запросом точек
const countsWait = () => countsLoading() || state.placeAlien;
// Пока данные текущего контекста не приехали (старт или едут новые), счётчики карточки
// и плашка итогов графика показывают «—» с пульсом, а не нули пустого набора — реальный
// ноль (нет ДТП) честно приходит только с готовыми данными. Пульс ведёт countsWait
function countsPending() {
  for (const id of ["count", "injured", "dead", "chart-count", "chart-injured-count", "chart-dead-count"]) ($(`#${id}`) as HTMLElement).textContent = "—";
  $("#statistics").classList.toggle("counts-loading", countsWait());
  $("#chart").classList.toggle("counts-loading", countsWait());
}
const EMPTY_HEAT: number[][] = [];
// Последний посчитанный срез — к нему переприсовываются слои при смене клиента карты
const lastRender = { visible: [] as any[], heatPoints: EMPTY_HEAT, heatVisible: false };
// Индекс регионов для поиска по названию (id совпадают с regions.geojson и REGION API)
const regionIndex: { id: number; name: string; lower: string }[] = [];
// Имя субъекта по id из /dict/regions — статус и заголовок графика
const regionName = (id: number | null) => id === null ? "" : regionIndex.find((region) => region.id === id)?.name || "";

// Параметры адресной строки: центр/зум читает maps, ?popup/?region — deeplink и loadFilters
const mapQuery = new URLSearchParams(location.search);
// Дебаг-режим (?debug в URL): вуаль затемнения, флажки её границы и панель ползунков
// тепла/затемнения. Обычному посетителю ничего из этого не показываем — в интерфейсе
// переключателя нет, только прямая ссылка с параметром
const debugMode = mapQuery.has("debug");

// Реестр «восходящих» вызовов: модули в начале графа зовут поздние только через actions —
// без бандлера это держит граф импортов ацикличным. Заполняется один раз в app.ts до boot
interface AppActions {
  loadMapData: (...args: unknown[]) => unknown;
  refreshCascade: (...args: unknown[]) => unknown;
  applyLanguage: (...args: unknown[]) => unknown;
  scheduleMapLoad: (...args: unknown[]) => unknown;
  applyHeatMode: (...args: unknown[]) => unknown;
  scheduleRegionLookup: (...args: unknown[]) => unknown;
  refreshRender: (...args: unknown[]) => unknown;
}
const actions: AppActions = {} as AppActions;

export { api, $, apiFetch, dataRange, state, regionCache, emTypeNames, EMPTY_HEAT, lastRender, regionIndex, regionName, setStatus, countsWait, countsPending, actions, mapQuery, debugMode };
export type { Bounds };
