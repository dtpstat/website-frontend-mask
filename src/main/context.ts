// Общий контекст приложения: состояние, утилиты DOM/API и реестр восходящих вызовов

// Локально (npm run serve) API доступен по тому же origin: serve.mjs проксирует /api на dtpstat-backend.7190805.xyz;
// иначе — напрямую на бэкенд через cloudflare-туннель (там валидный сертификат, CORS открыт)
const api = ["localhost", "127.0.0.1"].includes(location.hostname) ? "/api" : "https://dtpstat-backend.7190805.xyz/api";
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
type MapState = { language: string; mapClient: "leaflet" | "yandex" | "mapbox"; participants: any[]; filters: any[]; selectedFilters: Record<string, any[]>; selectedIntervals: Record<string, { from: string; to: string }>; territory: { id: number; name: string } | null; abort: AbortController | null; items: any[]; rawItems: any[]; rawItemsKey: string; dataLoadId: number; chartMode: string; minDate: string; maxDate: string; bboxSupported: boolean };
type Bounds = { west: number; south: number; east: number; north: number };
const persistedMapClient = localStorage.getItem("map-client");
const state: MapState = { language: new URLSearchParams(location.search).get("lang") || localStorage.getItem("language") || "ru", mapClient: persistedMapClient === "yandex" || persistedMapClient === "mapbox" ? persistedMapClient : "leaflet", participants: [], filters: [], selectedFilters: {}, selectedIntervals: {}, territory: null, abort: null, items: [], rawItems: [], rawItemsKey: "", dataLoadId: 0, chartMode: "days", minDate: "2015-01-01", maxDate: "2024-12-31", bboxSupported: false };
// Кэш загруженных точек: ключ запроса (период + фильтры) → ключ набора (регион или рамка) → точки.
// Новые наборы докачиваются по одному, уже скачанные не запрашиваются повторно.
const regionCache = new Map<string, Map<string, any[]>>();
// Названия видов ДТП из /dict/em_types — заполняется в loadFilters
const emTypeNames = new Map<number, string>();
function setStatus(message) { $("#filter-status").textContent = message; }
const EMPTY_HEAT: number[][] = [];
// Последний посчитанный срез — к нему переприсовываются слои при смене клиента карты
const lastRender = { visible: [] as any[], heatPoints: EMPTY_HEAT, heatVisible: false };
// Индекс регионов для поиска по названию (id совпадают с regions.geojson и REGION API)
const regionIndex: { id: number; name: string; lower: string }[] = [];

// Параметры адресной строки: центр/зум читает maps, ?popup/?region — deeplink и loadFilters
const mapQuery = new URLSearchParams(location.search);

// Реестр «восходящих» вызовов: модули в начале графа зовут поздние только через actions —
// без бандлера это держит граф импортов ацикличным. Заполняется один раз в app.ts до boot
interface AppActions {
  loadMapData: (...args: unknown[]) => unknown;
  refreshCascade: (...args: unknown[]) => unknown;
  applyLanguage: (...args: unknown[]) => unknown;
  scheduleMapLoad: (...args: unknown[]) => unknown;
  applyHeatMode: (...args: unknown[]) => unknown;
  scheduleRegionLookup: (...args: unknown[]) => unknown;
}
const actions: AppActions = {} as AppActions;

export { api, $, apiFetch, dataRange, state, regionCache, emTypeNames, EMPTY_HEAT, lastRender, regionIndex, setStatus, actions, mapQuery };
export type { Bounds };
