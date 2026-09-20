// Локально (npm run serve) API доступен по тому же origin: serve.mjs проксирует /api на vpn.kulikow.ru:3000;
// иначе — напрямую на бэкенд (нужен валидный сертификат, иначе браузер заблокирует запрос)
const api = ["localhost", "127.0.0.1"].includes(location.hostname) ? "/api" : "https://vpn.kulikow.ru:3000/api";
const $ = (selector) => document.querySelector(selector);
const dataRange = { min:"2015-01-01", max:"2026-08-31" };
type MonthPickerState = { open: boolean; target: "start" | "end"; year: number | null; start: string; end: string };
type MapState = { language: string; mapClient: "leaflet" | "yandex" | "mapbox"; participants: any[]; filters: any[]; selectedFilters: Record<string, any[]>; selectedIntervals: Record<string, { from: string; to: string }>; territory: { id: number; name: string } | null; abort: AbortController | null; items: any[]; rawItems: any[]; rawItemsKey: string; dataLoadId: number; chartMode: string; minDate: string; maxDate: string; picker: MonthPickerState; bboxSupported: boolean };
type Bounds = { west: number; south: number; east: number; north: number };
const persistedMapClient = localStorage.getItem("map-client");
const state: MapState = { language: new URLSearchParams(location.search).get("lang") || localStorage.getItem("language") || "ru", mapClient: persistedMapClient === "yandex" || persistedMapClient === "mapbox" ? persistedMapClient : "leaflet", participants: [], filters: [], selectedFilters: {}, selectedIntervals: {}, territory: null, abort: null, items: [], rawItems: [], rawItemsKey: "", dataLoadId: 0, chartMode: "days", minDate: "2015-01-01", maxDate: "2024-12-31", picker: { open: false, target: "start", year: null, start: "2024-01-01", end: "2024-12-31" }, bboxSupported: false };
// Кэш загруженных точек: ключ запроса (период + фильтры) → ключ набора (регион или рамка) → точки.
// Новые наборы докачиваются по одному, уже скачанные не запрашиваются повторно.
const regionCache = new Map<string, Map<string, any[]>>();
const copy = {
  ru: { brandAria:"Карта ДТП — главная", mapAria:"Интерактивная карта ДТП", map:"Карта", blog:"Блог и исследования", data:"Скачать данные", about:"О проекте", team:"Команда", support:"Поддержать проект", statistics:"Статистика", filters:"Фильтры", analytics:"Аналитика", apply:"Применить", cancel:"Отмена", backToBasic:"Назад к стандартным фильтрам", allTime:"За всё время", basicFilter:"Базовый фильтр", professionalFilter:"Профессиональные фильтры", startPeriod:"Начало периода", endPeriod:"Конец периода", chooseYear:"Выберите год", chooseMonth:"Выберите месяц", search:"Поиск", dataPeriod:"Период данных", accidentsInRussia:"ДТП в России", region:"Регион", allRegions:"Все регионы", from:"С", to:"По", participants:"Участники ДТП", injurySeverity:"Вред здоровью", light:"Лёгкий", serious:"Тяжёлый", fatal:"С погибшими", accidentTypes:"Типы ДТП", violations:"Нарушения ПДД", weather:"Погода", streets:"Улицы", heatRadius:"Радиус", heatBlur:"Размытие", heatOpacity:"Мин. непрозрачность", loading:"Загружаем данные…", loadingMap:"Обновляем карту…", unavailable:"Не удалось получить данные. Попробуйте позднее.", officialData:"Официальные данные", accidents:"ДТП", injured:"Пострадали", dead:"Погибли", distribution:"Распределение по дням", selectedPeriod:"За выбранный период", byDays:"По дням", byHours:"По часам", byTypes:"По типам ДТП", chartNote:"Диаграмма построена по ДТП в видимой области.", accidentsInArea:"ДТП в видимой области", people:"чел.", deaths:"погибших", roadConditions:"УДС на месте ДТП", roadConditionsNear:"УДС поблизости", roadFactors:"Факторы, влияющие на движение", roadDefects:"Повреждения УДС", signs:"Признаки ДТП", quantity:"Количество" },
  en: { brandAria:"Road accident map — home", mapAria:"Interactive road accident map", map:"Map", blog:"Blog & research", data:"Download data", about:"About the project", team:"Team", support:"Support the project", statistics:"Statistics", filters:"Filters", analytics:"Analytics", apply:"Apply", cancel:"Cancel", backToBasic:"Back to standard filters", allTime:"All time", basicFilter:"Basic filter", professionalFilter:"Professional filters", startPeriod:"Start of period", endPeriod:"End of period", chooseYear:"Select year", chooseMonth:"Select month", search:"Search", dataPeriod:"Data period", accidentsInRussia:"Road accidents in Russia", region:"Region", allRegions:"All regions", from:"From", to:"To", participants:"Road users", injurySeverity:"Injury severity", light:"Minor", serious:"Serious", fatal:"Fatal", accidentTypes:"Accident types", violations:"Traffic violations", weather:"Weather", streets:"Streets", heatRadius:"Radius", heatBlur:"Blur", heatOpacity:"Min. opacity", loading:"Loading data…", loadingMap:"Updating map…", unavailable:"Could not load data. Please try again later.", officialData:"Official data", accidents:"Accidents", injured:"Injured", dead:"Deaths", distribution:"Distribution by day", selectedPeriod:"Selected period", byDays:"By day", byHours:"By hour", byTypes:"By type", chartNote:"The chart is based on accidents in the visible area.", accidentsInArea:"Accidents in area", people:"people", deaths:"deaths", roadConditions:"Road conditions on site", roadConditionsNear:"Road conditions nearby", roadFactors:"Factors affecting traffic", roadDefects:"Road defects", signs:"Accident features", quantity:"Counts" },
};
Object.assign(copy.ru, { regionSearch:"Введите адрес или регион", noInjured:"Без пострадавших (нет данных)", accidentKind:"Вид ДТП", show:"Показать", lockPin:"Данные закреплены по территории", unlock:"Открепить данные", participantUnavailable:"По этому типу участников пока нет данных в открытом API", noMatches:"Ничего не найдено" });
Object.assign(copy.en, { regionSearch:"Enter address or region", noInjured:"No injuries (no data)", accidentKind:"Accident type", show:"Show", lockPin:"Data is pinned to the territory", unlock:"Unpin data", participantUnavailable:"No open API data for this road-user type yet", noMatches:"Nothing found" });
Object.assign(copy.ru, { heatIntensity:"Интенсивность", heatMapOpacity:"Непрозрачность" });
Object.assign(copy.en, { heatIntensity:"Intensity", heatMapOpacity:"Opacity" });
const participantTranslations = { "Все участники":"All users", "Пешеходы":"Pedestrians", "Велосипедисты":"Cyclists", "Мотоциклисты":"Motorcyclists", "Общ. транспорт":"Public transport", "Дети":"Children", "Без участника":"No road user" };
// Иконка и приближение по виду ДТП для каждой кнопки участников (значения как на dtp-stat.ru).
// Мотоциклисты/общ. транспорт/дети в открытых точках не различаются — emTypes нет, фильтр недоступен.
const participantConfig: Record<number, { icon: string; emTypes?: number[] }> = {
  1: { icon:"all" },
  2: { icon:"pedestrian", emTypes:[1] },
  3: { icon:"cyclist", emTypes:[8] },
  4: { icon:"motorcycle" },
  5: { icon:"public_transport" },
  6: { icon:"kids" },
};
// Секции проф-фильтра, которые уходят параметрами на сервер в /dtp/points.
// Live-проверено (2026-09-10): параметры kind 'arrays' (условие &&), 'mask' и 'interval' выполняются быстро;
// kind 'array' (= ANY(...)) виснет на стороне БД даже на малом регионе, поэтому секции с ними
// (тяжесть, участники, освещение, нарушения ПДД, марки ТС…) на сервер не передаются.
const serverSections = ["CLOUD", "DEFECT", "MOTION_INFLUENCE", "RD_CONSTR_HERE", "RD_CONSTR_THERE", "masks"];
const serverSectionLabels: Record<string, string> = { EM_TYPE:"accidentTypes", CLOUD:"weather", DEFECT:"roadDefects", MOTION_INFLUENCE:"roadFactors", RD_CONSTR_HERE:"roadConditions", RD_CONSTR_THERE:"roadConditionsNear" };
// Значение параметра-маски — сама битовая маска столбца: ADDITIONAL_ATTR (SIM=4, камеры=8, наркотики=1, отказ=2), CHILDREN_ATTR (3/7/71/135)
const maskFeatures = [
  { value:4, param:"SIM", preview:"ДТП с СИМ" },
  { value:8, param:"IN_AREA_OF_CAMERAS", preview:"В зоне камер" },
  { value:1, param:"DRUGS", preview:"Наркотическое опьянение" },
  { value:2, param:"REFUSAL_EXAMINED", preview:"Отказ от освидетельствования" },
  { value:3, param:"UNDER_16", preview:"С детьми до 16 лет" },
  { value:7, param:"UNDER_16_PASSENGER", preview:"Дети до 16, пассажиры" },
  { value:71, param:"UNDER_16_PASSENGER_ORG_MOVED", preview:"Дети до 16, организованная перевозка" },
  { value:135, param:"UNDER_16_PASSENGER_VIOLATION_RULES", preview:"Дети до 16, нарушение правил перевозки" },
];
const intervalFields = [
  { param:"VEH_AMOUNT", preview:"Транспорт", min:0, max:99 },
  { param:"PERS_AMOUNT", preview:"Участники", min:0, max:299 },
  { param:"LOST_AMOUNT", preview:"Погибшие", min:0, max:299 },
  { param:"SUFFER_AMOUNT", preview:"Раненые", min:0, max:299 },
];
// Названия видов ДТП из /dict/em_types — заполняется в loadFilters
const emTypeNames = new Map<number, string>();
const filterMetadata = {
  severity: { 0:{ ui_tone:"none" }, 1:{ ui_tone:"light" }, 3:{ ui_tone:"serious" }, 4:{ ui_tone:"fatal" } },
  category: { fatal:["пешеход", "велосипед", "сим", "гужевой", "животное", "лицо", "падение пассажира", "опрокидывание", "съезд с дороги", "столкновение"], serious:["возгорание", "препятствие", "стоящее тс", "падение груза"] },
  violations: { fatal:["алкогол", "наркот", "встречн", "переезд", "скорост", "обгон", "пешеходн", "светофор", "опасн", "сон за рул", "переутом", "нетрудоспособност"], serious:["ремн", "мотошлем", "дет", "дистанц", "интервал", "перестроен", "преимущ", "очередност", "разворот", "задним ход", "сигнал", "разметк", "знак", "велосипед", "сим", "мопед", "мобильн"] }
};
// Форматтеры Intl дорогие — создаём один раз на язык (в попапах их ждут тысячи точек)
const intlCache = new Map<string, any>();
function intlFormatter(kind: string, options: Intl.DateTimeFormatOptions | undefined) {
  const key = `${kind}:${state.language}`;
  let formatter = intlCache.get(key);
  if (!formatter) {
    const locale = state.language === "ru" ? "ru-RU" : "en-US";
    formatter = kind === "number" ? new Intl.NumberFormat(locale) : new Intl.DateTimeFormat(locale, options);
    intlCache.set(key, formatter);
  }
  return formatter;
}
const number = () => intlFormatter("number", undefined) as Intl.NumberFormat;
const t = (key) => copy[state.language][key];
function uiTone(filter, value) { const metadata = filterMetadata[filter.key || filter.name], text = String(value.preview || "").toLocaleLowerCase(); if (!metadata) return; if (metadata[value.value]) return metadata[value.value].ui_tone; return metadata.fatal?.some((term) => text.includes(term)) ? "fatal" : metadata.serious?.some((term) => text.includes(term)) ? "serious" : "light"; }
function enrichFilters(filters) { return filters.map((filter) => ({ ...filter, values:(filter.values || []).map((value) => ({ ...value, ...(uiTone(filter, value) ? { ui_tone:uiTone(filter, value) } : {}) })) })); }

function period() { return { start: $("#start-date").value, end: $("#end-date").value }; }
function severity() { return [...document.querySelectorAll('input[name="severity"]:checked')].map((input) => Number(input.value)); }
function selectedParticipants() { return state.participants.filter((participant) => participant.selected).map((participant) => participant.value); }
function setStatus(message) { $("#filter-status").textContent = message; }
function monthValue(value) { return value.slice(0, 7); }
function monthStartValue(value) { return `${value}-01`; }
function monthEndValue(value) { const [year, month] = value.split("-").map(Number); return `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`; }
// [from..to] (YYYY-MM-DD) → отрезки, не выходящие за пределы одного календарного месяца:
// слабому бэкенду легче отвечать на много мелких запросов, чем на один за весь период
function monthChunks(from: string, to: string) {
  const chunks: { from: string; to: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const [year, month] = cursor.split("-").map(Number);
    const monthEnd = monthEndValue(`${year}-${String(month).padStart(2, "0")}-01`), last = monthEnd < to ? monthEnd : to;
    chunks.push({ from: cursor, to: last });
    const next = new Date(year, month, 1);
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return chunks;
}
function displayMonth(value) { return intlFormatter("month-year", { month: "long", year: "numeric" }).format(new Date(`${value}-01T00:00:00`)); }

function renderDateFields() {
  const value = `${displayMonth(monthValue($("#start-date").value))} — ${displayMonth(monthValue($("#end-date").value))}`;
  document.querySelectorAll("#date-range-value, #advanced-date-range-value").forEach((node) => { node.textContent = value; });
  document.querySelectorAll("#date-range-button, #advanced-date-range-button").forEach((node) => node.setAttribute("aria-expanded", String(state.picker.open)));
}

function renderMonthPicker() {
  const picker = $("#month-picker"), months = $("#month-picker-months"), years = $("#month-picker-years"), { target, year } = state.picker;
  picker.hidden = !state.picker.open; if (!state.picker.open) return;
  $("#month-picker-title").textContent = `${t(target === "start" ? "startPeriod" : "endPeriod")}: ${t(year === null ? "chooseYear" : "chooseMonth")}`;
  const minimum = monthValue(state.minDate), maximum = monthValue(state.maxDate), firstYear = Number(minimum.slice(0, 4)), lastYear = Number(maximum.slice(0, 4)), selectedStart = monthValue(state.picker.start);
  years.replaceChildren(...Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index).map((value) => { const button = document.createElement("button"); button.type = "button"; button.textContent = String(value); button.disabled = target === "end" && value < Number(selectedStart.slice(0, 4)); button.classList.toggle("active", value === year); button.addEventListener("click", () => { state.picker.year = value; renderMonthPicker(); }); return button; }));
  months.hidden = year === null; if (year === null) { months.replaceChildren(); return; }
  months.replaceChildren(...Array.from({ length: 12 }, (_, index) => { const value = `${year}-${String(index + 1).padStart(2, "0")}`, button = document.createElement("button"); button.type = "button"; button.textContent = intlFormatter("month", { month: "long" }).format(new Date(year, index, 1)); button.disabled = value < minimum || value > maximum || (target === "end" && value < selectedStart); button.classList.toggle("active", value === monthValue(target === "start" ? state.picker.start : state.picker.end)); button.addEventListener("click", () => selectPickerMonth(value)); return button; }));
}

function selectPickerMonth(value) {
  if (state.picker.target === "start") { state.picker.start = monthStartValue(value); state.picker.target = "end"; state.picker.year = null; renderMonthPicker(); return; }
  state.picker.end = monthEndValue(value); $("#start-date").value = state.picker.start; $("#end-date").value = state.picker.end; state.picker.open = false; renderDateFields(); renderMonthPicker(); loadMapData();
}

function openMonthPicker() {
  state.picker = { open: true, target: "start", year: null, start: $("#start-date").value, end: $("#end-date").value };
  renderDateFields(); renderMonthPicker();
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.title = state.language === "ru" ? "Карта ДТП" : "Road accident map";
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { (node as HTMLInputElement).placeholder = t(node.dataset.i18nPlaceholder); });
  renderParticipants();
  renderAdvancedControls();
  renderAdvancedFilters();
  renderDateFields();
  renderMonthPicker();
  renderHeatControls();
}

function participantLabel(participant) { return state.language === "en" ? (participantTranslations[participant.preview] || participant.preview) : participant.preview; }
function renderParticipants() {
  const root = $("#participants");
  root.replaceChildren(...state.participants.slice(0, 6).map((participant) => {
    const button = document.createElement("button");
    button.type = "button";
    const icon = document.createElement("img"); icon.src = `assets/icons/${participantConfig[participant.value]?.icon || "all"}.svg`; icon.alt = "";
    const label = document.createElement("span"); label.textContent = participantLabel(participant);
    button.append(icon, label);
    button.classList.toggle("active", participant.selected);
    button.setAttribute("aria-pressed", String(participant.selected));
    button.addEventListener("click", () => {
      // Приближение есть только для пешеходов и велосипедистов — остальное честно отключаем
      if (!participantConfig[participant.value]?.emTypes) { setStatus(t("participantUnavailable")); return; }
      state.participants.forEach((item) => { item.selected = item.value === participant.value; });
      renderParticipants(); loadMapData();
    });
    return button;
  }));
  $("#collapsed-summary").textContent = state.participants.filter((participant) => participant.selected).map(participantLabel).join(", ");
}
function renderAdvancedControls() {
  const participants = $("#advanced-participants"), severity = $("#advanced-severity");
  participants.replaceChildren(...state.participants.map((participant) => { const label = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.checked = participant.selected; input.disabled = !participantConfig[participant.value]?.emTypes && participant.value !== 1; input.addEventListener("change", () => { if (!participantConfig[participant.value]?.emTypes && participant.value !== 1) { input.checked = false; setStatus(t("participantUnavailable")); return; } participant.selected = input.checked; renderParticipants(); loadMapData(); }); label.append(input, document.createTextNode(participantLabel(participant))); return label; }));
  severity.replaceChildren(...[...document.querySelectorAll<HTMLInputElement>('input[name="severity"]')].map((source) => { const value = Number(source.value), tone = state.filters.find((filter) => filter.name === "severity")?.values.find((item) => item.value === value)?.ui_tone || "light", label = document.createElement("label"), input = document.createElement("input"); label.className = `severity-tone ${tone}`; input.type = "checkbox"; input.checked = source.checked; input.disabled = source.disabled; input.addEventListener("change", () => { source.checked = input.checked; }); label.append(input, document.createTextNode(source.parentElement.textContent.trim())); return label; }));
}

function chartBuckets() {
  const groups = new Map();
  for (const item of state.items) {
    const key = state.chartMode === "hours" ? item.datetime.slice(11, 13) : state.chartMode === "types" ? item.category_name : item.datetime.slice(5, 10);
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const values = [...groups.entries()].sort((a, b) => state.chartMode === "types" ? b[1] - a[1] : a[0].localeCompare(b[0]));
  return state.chartMode === "types" ? values.slice(0, 10) : values;
}

function renderChart() {
  const bars = $("#bars");
  const values = chartBuckets();
  const max = Math.max(...values.map(([, count]) => count), 1);
  bars.replaceChildren(...values.map(([label, count]) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.title = `${label}: ${number().format(count)} ${t("accidents")}`;
    const column = document.createElement("i");
    column.style.height = `${Math.max(3, Math.round(count / max * 220))}px`;
    const caption = document.createElement("label");
    caption.textContent = label;
    bar.append(column, caption);
    return bar;
  }));
}

const mapQuery = new URLSearchParams(location.search), initialCenter = (mapQuery.get("center") || "").split(":").map(Number), zoomQuery = mapQuery.get("zoom"), initialZoom = zoomQuery === null ? NaN : Number(zoomQuery);
const map = L.map("leaflet-map", { zoomControl: false, minZoom: 4 }).setView(initialCenter.length === 2 && initialCenter.every(Number.isFinite) ? initialCenter : [55.76, 37.64], Number.isFinite(initialZoom) ? initialZoom : 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
const accidents = L.layerGroup().addTo(map);
const markers = new Map<string, any>();
const heatSettings = { radius: 6, blur: 9, minOpacity: .05 };
const heatGradient = { 0: "rgba(126, 171, 85, 0)", .2: "rgba(126, 171, 85, 0.6)", .4: "rgba(255, 254, 85, 0.7)", .6: "rgba(245, 193, 66, 0.8)", .8: "rgba(223, 130, 68, 0.9)", 1: "rgba(176, 36, 24, 1)" };
const heat = L.heatLayer([], { ...heatSettings, maxZoom: 12, gradient: heatGradient }).addTo(map);
const yandexHeatSettings = { radius: 15, opacity: .5, intensityOfMidpoint: .5 };
const yandex = { map: null as any, points: null as any, heatCanvas: null as HTMLCanvasElement | null, heatCtx: null as CanvasRenderingContext2D | null, loading: null as Promise<void> };
const mapboxHeatSettings = { radius: 15, opacity: .5, intensity: .5 };
const mapbox = { map: null as any, loading: null as Promise<void> };
function mapboxHeatPaint() {
  const { radius, intensity, opacity } = mapboxHeatSettings;
  return { radius:["interpolate", ["linear"], ["zoom"], 4, radius * .75, 7, radius * .9, 10, radius, 12, radius * 1.15], intensity:["interpolate", ["linear"], ["zoom"], 4, intensity * .7, 7, intensity * .85, 10, intensity, 12, intensity * 1.1], opacity };
}

function leafletView() { const bounds = map.getBounds(), center = map.getCenter(); return { center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom(), bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }; }
function yandexView() { const center = yandex.map.getCenter(), bounds = yandex.map.getBounds(); return { center: { latitude: center[1], longitude: center[0] }, zoom: yandex.map.getZoom(), bounds: { west: bounds[0][0], south: bounds[0][1], east: bounds[1][0], north: bounds[1][1] } }; }
function mapboxView() { const center = mapbox.map.getCenter(), bounds = mapbox.map.getBounds(); return { center: { latitude: center.lat, longitude: center.lng }, zoom: mapbox.map.getZoom(), bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }; }
function currentView() { return state.mapClient === "yandex" && yandex.map ? yandexView() : state.mapClient === "mapbox" && mapbox.map ? mapboxView() : leafletView(); }
function heatFeatures(points) { return points.map(([latitude, longitude, weight]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [longitude, latitude] }, properties: { weight: weight || 1 } })); }
const EMPTY_HEAT: number[][] = [];
// Последний посчитанный срез — к нему переприсовываются слои при смене клиента карты
const lastRender = { visible: [] as any[], heatPoints: EMPTY_HEAT, heatVisible: false };
// Тепловая карта строится только по видимой области с запасом в пол-экрана:
// тепловой слой Яндекса перерисовывается на каждое изменение границ карты,
// и при полном наборе точек (вся Россия — 90k+) это замораживает карту
function heatInView(filtered, view) {
  const { west, south, east, north } = view.bounds, dx = (east - west) / 2, dy = (north - south) / 2, points = [];
  for (const item of filtered) {
    const { longitude, latitude } = item.point;
    if (longitude >= west - dx && longitude <= east + dx && latitude >= south - dy && latitude <= north + dy) points.push([latitude, longitude, 1]);
  }
  return points;
}
function renderMarkers(visible) {
  // Добавляем/убираем только изменившиеся маркеры вместо полной пересборки слоя
  const alive = new Set(visible.map((item) => item.id));
  for (const [id, marker] of markers) if (!alive.has(id)) { marker.remove(); markers.delete(id); }
  // Плоские точки без обводки — как на dtp-stat.ru
  for (const item of visible) if (!markers.has(item.id)) markers.set(item.id, L.circleMarker([item.point.latitude, item.point.longitude], { radius: item.severity === 4 ? 6.5 : 5.5, weight: 0, fillColor: markerColor(item), fillOpacity: 1 }).bindPopup(markerPopup(item)).addTo(accidents));
}
function renderLeaflet(visible, heatPoints, heatVisible) {
  renderMarkers(heatVisible ? [] : visible);
  heat.setLatLngs(heatVisible ? heatPoints : []);
}
const yandexMarkers = new Map<string, any>();
// Слой тепла рисуем своим canvas: ymaps.Heatmap синхронно перерисовывает все тайлы
// на каждую смену опций/зума (150–400ms) — ползунки и зум «зависали».
// Набор прореживается до лимита, вес прореженной точки = шагу выборки.
const yandexHeatLimit = 12000;
function decimateHeat(points: number[][]) {
  if (points.length <= yandexHeatLimit) return points;
  const stride = Math.ceil(points.length / yandexHeatLimit), sampled: number[][] = [];
  for (let index = 0; index < points.length; index += stride) sampled.push([points[index][0], points[index][1], stride]);
  return sampled;
}
const yandexHeatBrush = { canvas: null as HTMLCanvasElement | null, radius: 0 };
function heatBrush(radius: number) {
  radius = Math.max(2, Math.round(radius));
  if (yandexHeatBrush.canvas && yandexHeatBrush.radius === radius) return yandexHeatBrush.canvas;
  const brush = document.createElement("canvas");
  brush.width = brush.height = radius * 2;
  const context = brush.getContext("2d")!, gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)"); gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient; context.fillRect(0, 0, radius * 2, radius * 2);
  yandexHeatBrush.canvas = brush; yandexHeatBrush.radius = radius;
  return brush;
}
const yandexHeatLut = { data: null as Uint8ClampedArray | null };
function heatGradientLut() {
  if (yandexHeatLut.data) return yandexHeatLut.data;
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 256;
  const context = canvas.getContext("2d")!, gradient = context.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of Object.entries(heatGradient)) gradient.addColorStop(Number(stop), color);
  context.fillStyle = gradient; context.fillRect(0, 0, 1, 256);
  yandexHeatLut.data = context.getImageData(0, 0, 1, 256).data;
  return yandexHeatLut.data;
}
const yandexHeatBuffer = { canvas: null as HTMLCanvasElement | null };
function drawYandexHeat(heatPoints, heatVisible) {
  const canvas = yandex.heatCanvas, map = yandex.map;
  if (!canvas || !map) return;
  if (!heatVisible || !heatPoints.length) { canvas.style.display = "none"; return; }
  canvas.style.display = "block";
  canvas.style.opacity = String(yandexHeatSettings.opacity);
  const container = $("#yandex-map") as HTMLElement, dpr = window.devicePixelRatio || 1;
  const width = container.clientWidth, height = container.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  const ctx = yandex.heatCtx!;
  const projection = map.options.get("projection"), zoom = map.getZoom();
  const [centerX, centerY] = projection.toGlobalPixels(map.getCenter(), zoom);
  const offsetX = width / 2 - centerX, offsetY = height / 2 - centerY;
  // Копим плотность в буфере вдвое мельче экрана: пиксельных операций вчетверо
  // меньше, а билинейный апскейл сам размывает — широкие кисти не нужны
  const unit = 2 * dpr;
  const bw = Math.max(1, Math.ceil(canvas.width / unit)), bh = Math.max(1, Math.ceil(canvas.height / unit));
  let buffer = yandexHeatBuffer.canvas;
  if (!buffer) { buffer = document.createElement("canvas"); yandexHeatBuffer.canvas = buffer; }
  if (buffer.width !== bw || buffer.height !== bh) { buffer.width = bw; buffer.height = bh; }
  const bctx = buffer.getContext("2d", { willReadFrequently: true })!;
  const brush = heatBrush(yandexHeatSettings.radius / 2), r = yandexHeatBrush.radius;
  // Соседние точки сливаются в ячейку: на плотных участках drawImage в разы
  // меньше, вес ячейки = сумме весов точек
  const cell = Math.max(2, Math.round(r / 2)), cols = Math.ceil(bw / cell) + 1, merged = new Map<number, number>();
  for (const [latitude, longitude, weight] of decimateHeat(heatPoints)) {
    const [globalX, globalY] = projection.toGlobalPixels([longitude, latitude], zoom);
    const x = (globalX + offsetX) * dpr / unit, y = (globalY + offsetY) * dpr / unit;
    if (x < -r || y < -r || x > bw + r || y > bh + r) continue;
    const key = Math.floor(y / cell) * cols + Math.floor(x / cell);
    merged.set(key, (merged.get(key) || 0) + weight);
  }
  bctx.clearRect(0, 0, bw, bh);
  for (const [key, weight] of merged) {
    const x = (key % cols) * cell + cell / 2, y = Math.floor(key / cols) * cell + cell / 2;
    bctx.globalAlpha = Math.min(1, Math.sqrt(weight));
    bctx.drawImage(brush, x - r, y - r);
  }
  // Альфа-канал перекладываем в цвет по градиенту (LUT 1×256), как у simpleheat
  bctx.globalAlpha = 1;
  const image = bctx.getImageData(0, 0, bw, bh), data = image.data, lut = heatGradientLut();
  const intensity = .5 + yandexHeatSettings.intensityOfMidpoint;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index];
    if (!alpha) continue;
    const color = Math.min(255, Math.round(alpha * intensity)) << 2;
    data[index - 3] = lut[color]; data[index - 2] = lut[color + 1]; data[index - 1] = lut[color + 2]; data[index] = lut[color + 3];
  }
  bctx.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
}
let yandexHeatFrame = 0;
function scheduleYandexHeat() {
  if (yandexHeatFrame) return;
  yandexHeatFrame = requestAnimationFrame(() => { yandexHeatFrame = 0; drawYandexHeat(lastRender.heatPoints, lastRender.heatVisible); });
}
function renderYandex(visible, heatPoints, heatVisible) {
  if (!yandex.map) return;
  // Placemark'и обновляем диффом, а не пересозданием всех на каждый сдвиг карты
  const alive = new Set(heatVisible ? [] : visible.map((item) => item.id));
  for (const [id, placemark] of yandexMarkers) if (!alive.has(id)) { yandex.points.remove(placemark); yandexMarkers.delete(id); }
  if (!heatVisible) for (const item of visible) if (!yandexMarkers.has(item.id)) {
    // Маленькая плоская точка с цветом по тяжести вместо крупных пресетов CircleDot.
    // Балун строим только по клику: на зуме добавляются сотни точек разом
    const placemark = new (window as any).ymaps.Placemark([item.point.longitude, item.point.latitude], {}, { preset: "islands#circleIcon", iconColor: markerColor(item) });
    placemark.events.add("click", (event) => { event.stopPropagation(); yandex.map.balloon.open(event.get("coords"), { content: markerPopup(item) }, { autoPan: false }); });
    yandexMarkers.set(item.id, placemark);
    yandex.points.add(placemark);
  }
  drawYandexHeat(heatPoints, heatVisible);
}
function renderMapbox(visible, heatPoints, heatVisible) {
  if (!mapbox.map?.isStyleLoaded()) return;
  mapbox.map.getSource("dtp-heat")?.setData({ type:"FeatureCollection", features: heatVisible ? heatFeatures(heatPoints) : [] });
  mapbox.map.getSource("dtp-points")?.setData({ type:"FeatureCollection", features: heatVisible ? [] : visible.map((item) => ({ type:"Feature", geometry:{ type:"Point", coordinates:[item.point.longitude, item.point.latitude] }, properties:{ severity:item.severity, popup:markerPopup(item) } })) });
  const paint = mapboxHeatPaint();
  mapbox.map.setPaintProperty("dtp-heat", "heatmap-radius", paint.radius); mapbox.map.setPaintProperty("dtp-heat", "heatmap-intensity", paint.intensity); mapbox.map.setPaintProperty("dtp-heat", "heatmap-opacity", paint.opacity);
}
function loadScript(src) { return new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error("Yandex Maps unavailable")); document.head.append(script); }); }
function loadYandexScript() {
  const key = (window as any).YANDEX_MAPS_KEY;
  if (!key) return Promise.reject(new Error("Yandex Maps key is missing"));
  if (!yandex.loading) yandex.loading = (window as any).ymaps ? Promise.resolve() : loadScript(`https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=${state.language === "ru" ? "ru_RU" : "en_US"}&coordorder=longlat`);
  return yandex.loading;
}
async function ensureYandex(view) {
  if (yandex.map) { yandex.map.setCenter([view.center.longitude, view.center.latitude], view.zoom); return; }
  await loadYandexScript();
  const ymaps = (window as any).ymaps;
  await ymaps.ready();
  yandex.map = new ymaps.Map("yandex-map", { center: [view.center.longitude, view.center.latitude], zoom: view.zoom, controls: ["zoomControl"] }, { maxZoom: 20, minZoom: 1, avoidFractionalZoom: true, yandexMapDisablePoiInteractivity: true, suppressMapOpenBlock: true });
  yandex.points = new ymaps.GeoObjectCollection(); yandex.map.geoObjects.add(yandex.points);
  const canvas = document.createElement("canvas");
  canvas.className = "yandex-heat";
  $("#yandex-map").append(canvas);
  yandex.heatCanvas = canvas;
  yandex.heatCtx = canvas.getContext("2d", { willReadFrequently: true });
  renderYandex(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible);
  yandex.map.events.add("boundschange", () => { if (state.mapClient === "yandex") { scheduleMapLoad(); scheduleYandexHeat(); } });
}
function loadMapboxScript() {
  const key = (window as any).MAPBOX_ACCESS_TOKEN;
  if (!key) return Promise.reject(new Error("Mapbox token is missing"));
  if (!mapbox.loading) mapbox.loading = ((window as any).mapboxgl ? Promise.resolve() : loadScript("https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.js"));
  return mapbox.loading;
}
async function ensureMapbox(view) {
  if (mapbox.map) { mapbox.map.jumpTo({ center:[view.center.longitude, view.center.latitude], zoom:view.zoom }); return; }
  await loadMapboxScript(); const mapboxgl = (window as any).mapboxgl; mapboxgl.accessToken = (window as any).MAPBOX_ACCESS_TOKEN;
  mapbox.map = new mapboxgl.Map({ container:"mapbox-map", style:"mapbox://styles/mapbox/standard", config:{ basemap:{ theme:"monochrome", lightPreset:"day" } }, center:[view.center.longitude, view.center.latitude], zoom:view.zoom }); mapbox.map.addControl(new mapboxgl.NavigationControl());
  mapbox.map.on("load", () => {
    mapbox.map.addSource("dtp-heat", { type:"geojson", data:{ type:"FeatureCollection", features:[] } }); mapbox.map.addSource("dtp-points", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
    const paint = mapboxHeatPaint();
    mapbox.map.addLayer({ id:"dtp-heat", type:"heatmap", source:"dtp-heat", paint:{ "heatmap-weight":["get", "weight"], "heatmap-intensity":paint.intensity, "heatmap-radius":paint.radius, "heatmap-opacity":paint.opacity, "heatmap-color":["interpolate", ["linear"], ["heatmap-density"], 0,"rgba(126, 171, 85, 0)", .2,"rgba(126, 171, 85, .6)", .4,"rgba(255, 254, 85, .7)", .6,"rgba(245, 193, 66, .8)", .8,"rgba(223, 130, 68, .9)", 1,"rgba(176, 36, 24, 1)"] } });
    mapbox.map.addLayer({ id:"dtp-points", type:"circle", source:"dtp-points", paint:{ "circle-radius":["case", ["==", ["get", "severity"], 4], 6.5, 5.5], "circle-color":["match", ["get", "severity"], 4,"#FF001A", 3,"#FF7F24", 1,"#FFB81F", "rgba(24, 51, 74, 0.5)"], "circle-stroke-width":0, "circle-opacity":1 } });
    mapbox.map.on("click", "dtp-points", (event) => new mapboxgl.Popup().setLngLat(event.features[0].geometry.coordinates).setHTML(event.features[0].properties.popup).addTo(mapbox.map));
    renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible);
  });
  mapbox.map.on("moveend", () => { if (state.mapClient === "mapbox") scheduleMapLoad(); });
}
function renderMapSwitcher() { document.querySelectorAll("[data-map-client], [data-quick-map]").forEach((button) => button.classList.toggle("active", (button.dataset.mapClient || button.dataset.quickMap) === state.mapClient)); }
async function switchMapClient(client) {
  if (client === state.mapClient) return;
  const view = currentView(); state.mapClient = client; localStorage.setItem("map-client", client); renderMapSwitcher(); renderHeatControls();
  $("#leaflet-map").hidden = client !== "leaflet"; $("#yandex-map").hidden = client !== "yandex"; $("#mapbox-map").hidden = client !== "mapbox";
  if (client === "leaflet") { map.setView([view.center.latitude, view.center.longitude], view.zoom, { animate: false }); map.invalidateSize(); renderLeaflet(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); return; }
  try {
    if (client === "yandex") { await ensureYandex(view); renderYandex(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); }
    else { await ensureMapbox(view); renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); mapbox.map.resize(); }
  } catch { state.mapClient = "leaflet"; localStorage.setItem("map-client", "leaflet"); $("#yandex-map").hidden = true; $("#mapbox-map").hidden = true; $("#leaflet-map").hidden = false; renderMapSwitcher(); renderHeatControls(); setStatus(t("unavailable")); }
}

function contains(bounds, point) { return point.longitude >= bounds.west && point.longitude <= bounds.east && point.latitude >= bounds.south && point.latitude <= bounds.north; }
function pointItems(data) {
  return (data.features || []).map((feature) => {
    const item = feature.properties || {}, [longitude, latitude] = feature.geometry?.coordinates || [];
    // hv_category: 1 — никто не пострадал (в точках API не встречается), 2 — лёгкий, 3 — тяжёлый, 4 — с погибшими
    const severity = item.hv_category === 1 ? 0 : item.hv_category === 2 ? 1 : item.hv_category === 3 ? 3 : item.lost_amount ? 4 : item.suffer_amount ? 3 : 0;
    return { id:String(item.em_number), datetime:item.date_time, participants:Number(item.pers_amount || 0), injured:Number(item.suffer_amount || 0), dead:Number(item.lost_amount || 0), point:{ latitude, longitude }, severity, category:Number(item.em_type_id), category_name:emTypeNames.get(Number(item.em_type_id)) || (state.language === "ru" ? "ДТП" : "Road accident"), address:item.address, street:item.address, participant_categories:[1] };
  }).filter((item) => Number.isFinite(item.point.latitude) && Number.isFinite(item.point.longitude));
}
// Палитра точек dtp-stat.ru: без пострадавших / лёгкий / тяжёлый / с погибшими
function markerColor(item) { return item.severity === 4 ? "#FF001A" : item.severity === 3 ? "#FF7F24" : item.severity === 1 ? "#FFB81F" : "rgba(24, 51, 74, 0.5)"; }
function pluralPeople(count) {
  const last = count % 10, two = count % 100;
  return last >= 2 && last <= 4 && (two < 10 || two > 20) ? (state.language === "ru" ? "человека" : "people") : (state.language === "ru" ? "человек" : "people");
}
// HTML попапа кэшируется: один и тот же пункт попадает в попап/GeoJSON многократно
const popupCache = new WeakMap<object, string>();
function markerPopup(item) {
  const cached = popupCache.get(item);
  if (cached) return cached;
  const place = item.address || item.street || t("accidentsInArea");
  const escape = (value) => String(value || "").replace(/[&<>\"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" })[character]);
  const details = state.language === "en" ? "Accident details" : "Подробности ДТП";
  const day = intlFormatter("day", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date(item.datetime));
  const injured = item.injured > 0 ? `<p class="popup-injured">${number().format(item.injured)} ${pluralPeople(item.injured)} ${state.language === "ru" ? (item.injured === 1 && item.injured % 100 !== 11 ? "пострадал" : "пострадали") : item.injured === 1 ? "was injured" : "were injured"}</p>` : "";
  const dead = item.dead > 0 ? `<p class="popup-dead">${number().format(item.dead)} ${pluralPeople(item.dead)} ${state.language === "ru" ? (item.dead % 10 === 1 && item.dead % 100 !== 11 ? "погиб" : "погибло") : item.dead === 1 ? "died" : "died"}</p>` : "";
  const html = `<div class="marker-popup"><strong>${escape(item.category_name)}</strong><span>${escape(day)}, ${escape(item.datetime.slice(11, 16))}</span><span>${escape(place)}</span>${injured}${dead}<a href="details/?id=${encodeURIComponent(item.id)}&lang=${state.language}">${details}</a></div>`;
  popupCache.set(item, html);
  return html;
}
function dynamicValues(filter) { return filter.key === "street" && !filter.values.length ? [...new Set(state.rawItems.map((item) => item.street).filter(Boolean))].sort().map((value) => ({ value, preview:value })) : filter.values || []; }
function renderAdvancedFilters() {
  const root = $("#advanced-dynamic");
  root.replaceChildren(...state.filters.filter((filter) => filter.param).map((filter) => {
    const section = document.createElement("details"), title = document.createElement("summary"), name = document.createElement("span"), options = document.createElement("div"), key = filter.key || filter.name;
    name.textContent = filter.label;
    // Интервалы «от–до» — числовые поля вместо списка значений
    if (filter.key === "intervals") {
      section.className = "advanced-collapse"; options.className = "advanced-options advanced-intervals";
      for (const field of filter.values) {
        const range = state.selectedIntervals[field.param] || { from:"", to:"" }, row = document.createElement("div"), caption = document.createElement("span"), from = document.createElement("input"), to = document.createElement("input");
        row.className = "advanced-interval"; caption.textContent = field.preview;
        from.type = to.type = "number"; from.min = to.min = String(field.min); from.max = to.max = String(field.max); from.placeholder = t("from"); to.placeholder = t("to");
        from.value = range.from; to.value = range.to;
        const sync = () => { if (from.value || to.value) state.selectedIntervals[field.param] = { from:from.value, to:to.value }; else delete state.selectedIntervals[field.param]; };
        from.addEventListener("input", sync); to.addEventListener("input", sync);
        row.append(caption, from, to); options.append(row);
      }
      title.append(name); section.append(title, options); return section;
    }
    const search = document.createElement("input");
    section.className = "advanced-collapse" + (filter.key === "street" || filter.values.length > 8 ? " has-search" : "");
    search.type = "search"; search.placeholder = t("search"); search.className = "advanced-search"; options.className = "advanced-options";
    const draw = () => { const query = search.value.trim().toLowerCase(), selected = state.selectedFilters[key] || []; options.replaceChildren(...dynamicValues(filter).filter((item) => item.preview.toLowerCase().includes(query)).map((item) => { const label = document.createElement("label"), input = document.createElement("input"); if (item.ui_tone) label.className = `filter-tone ${item.ui_tone}`; input.type = "checkbox"; input.checked = selected.includes(item.value); input.addEventListener("change", () => { const values = new Set(state.selectedFilters[key] || []); input.checked ? values.add(item.value) : values.delete(item.value); state.selectedFilters[key] = [...values]; }); label.append(input, document.createTextNode(item.preview)); return label; })); };
    search.addEventListener("click", (event) => event.stopPropagation()); search.addEventListener("keydown", (event) => event.stopPropagation()); search.addEventListener("input", draw); title.append(name, search); section.append(title, options); draw(); return section;
  }));
}
function openAdvanced() { renderAdvancedControls(); renderAdvancedFilters(); syncAdvancedRegion(); document.body.classList.add("advanced-open"); $("#advanced-filter").hidden = false; }
function syncAdvancedRegion() {
  const select = $("#advanced-region") as HTMLSelectElement;
  const options = [Object.assign(document.createElement("option"), { value: "", textContent: t("allRegions") })];
  for (const region of [...regionIndex].sort((a, b) => a.name.localeCompare(b.name, "ru"))) options.push(Object.assign(document.createElement("option"), { value: String(region.id), textContent: region.name }));
  select.replaceChildren(...options);
  select.value = state.territory ? String(state.territory.id) : "";
}
function closeAdvanced() { document.body.classList.remove("advanced-open"); $("#advanced-filter").hidden = true; $("#filters").hidden = false; }
function passesFilters(item, emTypes, levels, categories) {
  return (!emTypes || emTypes.includes(item.category)) && (!levels.length || levels.includes(item.severity)) && categories.every(([key, values]) => Array.isArray(item[key]) ? item[key].some((value) => values.includes(value)) : values.includes(item[key]));
}
// Параметры серверной фильтрации /dtp/points: выбранные секции-словари, признаки-маски и интервалы
function serverQuery() {
  const params = new URLSearchParams();
  for (const [name, values] of Object.entries(state.selectedFilters)) {
    if (!values.length) continue;
    if (name === "masks") for (const value of values) { const feature = maskFeatures.find((item) => item.value === value); if (feature) params.append(feature.param, String(feature.value)); }
    else if (serverSections.includes(name)) params.append(`${name}_IDS`, values.join(","));
  }
  for (const [param, range] of Object.entries(state.selectedIntervals)) {
    if (range.from) params.append(`${param}_FROM`, range.from);
    if (range.to) params.append(`${param}_TO`, range.to);
  }
  return params;
}
// Выбранные участники → набор видов ДТП (приближение по em_type_id); null — без фильтра
function participantEmTypes() {
  const selected = selectedParticipants();
  if (!selected.length || selected.includes(1)) return null;
  const set = new Set();
  for (const value of selected) for (const em of participantConfig[value]?.emTypes || []) set.add(em);
  return set.size ? [...set] : [-1];
}
const regionShapes = fetch("assets/regions.geojson").then((response) => response.ok ? response.json() : Promise.reject(new Error("Region boundaries unavailable")));
function inRing(point, ring) { let inside = false; for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) { const [x, y] = ring[index], [px, py] = ring[previous]; if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside; } return inside; }
// Рамка для запроса точек: в полтора раза шире видимой области, чтобы панорамирование
// в её пределах обходилось без новых запросов. Ключ рамки округляется до 0.001° (~100 м),
// чтобы микродвижения карты не порождали новые наборы в кэше.
type MapFrame = Bounds & { key: string; covers: (view: Bounds) => boolean };
let loadedFrame: MapFrame | null = null;
function viewFrame(bounds: Bounds): MapFrame {
  const dx = (bounds.east - bounds.west) / 2, dy = (bounds.north - bounds.south) / 2, round = (value: number) => Math.round(value * 1000) / 1000;
  const frame = { west: round(bounds.west - dx), east: round(bounds.east + dx), south: round(bounds.south - dy), north: round(bounds.north + dy) };
  return { ...frame, key: `${frame.south},${frame.west},${frame.north},${frame.east}`, covers: (view: Bounds) => view.west >= frame.west && view.east <= frame.east && view.south >= frame.south && view.north <= frame.north };
}
// Фолбэк для бэкенда без LATITUDE/LONGITUDE: регион под центром видимой области.
// Внутренние кольца (дырки) учитываем, из содержащих регионов выбираем наименьший —
// иначе Москва попадёт во внешнее кольцо Московской области
async function regionAtCenter(bounds: Bounds) {
  const data = await regionShapes, x = (bounds.west + bounds.east) / 2, y = (bounds.south + bounds.north) / 2, point = [x, y];
  const contains = (rings) => rings.length && inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring));
  let best: number | null = null, bestArea = Infinity;
  for (const feature of data.features || []) {
    const geometry = feature.geometry, polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    if (!polygons.some(contains)) continue;
    const box = featureBounds(feature), area = (box.east - box.west) * (box.north - box.south);
    if (area < bestArea) { bestArea = area; best = Number(feature.properties.id); }
  }
  return best !== null && Number.isFinite(best) ? best : null;
}
// Фильтрация пересчитывается только при смене данных/фильтров,
// при панорамировании берётся готовый результат
const filterCache = { key: "", filtered: [] as any[] };
function filteredPoints() {
  // Клиентски фильтруются только секции, чьи поля есть в точках (тип ДТП, тяжесть, участники);
  // серверные секции (serverSections) уже отфильтрованы при загрузке /dtp/points
  const emTypes = participantEmTypes(), levels = severity();
  const selected = Object.entries(state.selectedFilters).filter(([key, values]) => values.length && !serverSections.includes(key));
  const key = `${state.rawItemsKey}|${emTypes?.join(",")}|${levels.join(",")}|${JSON.stringify(selected)}`;
  if (filterCache.key !== key) {
    filterCache.filtered = state.rawItems.filter((item) => item.point && passesFilters(item, emTypes, levels, selected));
    filterCache.key = key;
  }
  return filterCache.filtered;
}

// Индекс регионов для поиска по названию (id совпадают с regions.geojson и REGION API)
const regionIndex: { id: number; name: string; lower: string }[] = [];
function featureBounds(feature) {
  const geometry = feature.geometry, polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let west = 180, south = 90, east = -180, north = -90;
  for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) { if (x < west) west = x; if (x > east) east = x; if (y < south) south = y; if (y > north) north = y; }
  return { west, south, east, north };
}
function updateTerritoryCard() {
  $("#region-name").textContent = state.territory ? state.territory.name : t("allRegions");
  const locked = Boolean(state.territory);
  $("#lock-button").classList.toggle("locked", locked);
  $("#lock-button").setAttribute("aria-pressed", String(locked));
  $("#lock-button").title = locked ? t("unlock") : t("lockPin");
}
async function selectRegion(region) {
  const data = await regionShapes;
  const feature = (data.features || []).find((item) => Number(item.properties.id) === region.id);
  if (!feature) return;
  state.territory = { id: region.id, name: region.name };
  updateTerritoryCard();
  $("#region-suggest").hidden = true;
  $("#region-search").value = "";
  // Карта открывается по центру выбранной области (города региона)
  const { west, south, east, north } = featureBounds(feature);
  if (state.mapClient === "yandex" && yandex.map) yandex.map.setBounds([[west, south], [east, north]], { checkZoomRange: true });
  else if (state.mapClient === "mapbox" && mapbox.map) mapbox.map.fitBounds([[west, south], [east, north]], { duration: 0 });
  else map.fitBounds([[south, west], [north, east]], { animate: false });
  loadMapData();
}
function drawRegionSuggest() {
  const input = $("#region-search") as HTMLInputElement, suggest = $("#region-suggest");
  const query = input.value.trim().toLowerCase();
  if (!query) { suggest.hidden = true; suggest.replaceChildren(); return; }
  const matches = regionIndex.filter((region) => region.lower.includes(query)).slice(0, 8);
  suggest.hidden = false;
  suggest.replaceChildren(...(matches.length ? matches : []).map((region) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = region.name;
    button.addEventListener("mousedown", (event) => { event.preventDefault(); selectRegion(region); });
    return button;
  }));
  if (!matches.length) { const empty = document.createElement("p"); empty.className = "region-suggest-empty"; empty.textContent = t("noMatches"); suggest.append(empty); }
}
function renderMapData(view) {
  const filtered = filteredPoints(), visible = [];
  for (const item of filtered) if (contains(view.bounds, item.point)) visible.push(item);
  // При закреплённой территории счётчики считаются по всей территории, а не по видимой области
  const counted = state.territory ? filtered : visible;
  state.items = counted;
  $("#count").textContent = number().format(counted.length);
  $("#injured").textContent = number().format(counted.reduce((sum, item) => sum + Number(item.injured || 0), 0));
  $("#dead").textContent = number().format(counted.reduce((sum, item) => sum + Number(item.dead || 0), 0));
  if (!$("#chart").hidden) renderChart();
  const heatVisible = view.zoom < 12 || visible.length >= 1000;
  const heatPoints = heatVisible ? heatInView(filtered, view) : EMPTY_HEAT;
  // Слои переприсовываются только у активного клиента — остальные догонят при переключении
  Object.assign(lastRender, { visible, heatPoints, heatVisible });
  if (state.mapClient === "leaflet") renderLeaflet(visible, heatPoints, heatVisible);
  else if (state.mapClient === "yandex") renderYandex(visible, heatPoints, heatVisible);
  else renderMapbox(visible, heatPoints, heatVisible);
  // Прямая ссылка на конкретное ДТП открывает его попап (?popup=<em_number>)
  const linkedMarker = mapQuery.get("popup") && markers.get(mapQuery.get("popup"));
  if (linkedMarker) linkedMarker.openPopup();
  setStatus(`${number().format(counted.length)} ${(state.territory ? t("accidents") : t("accidentsInArea")).toLowerCase()}`);
}

async function loadMapData() {
  const { start, end } = period();
  if (!start || !end || end < start) return;
  state.abort?.abort();
  const controller = state.abort = new AbortController(), loadId = ++state.dataLoadId, view = currentView();
  setStatus(t("loadingMap"));
  try {
    const server = serverQuery(), chunks = monthChunks(start, end);
    const bucketKey = `${start}|${end}|${server.toString()}`;
    // Держим один активный бакет: смена периода/серверных фильтров даёт новый ключ
    if (!regionCache.has(bucketKey)) { regionCache.clear(); loadedFrame = null; }
    const bucket = regionCache.get(bucketKey) ?? new Map<string, any[]>();
    regionCache.set(bucketKey, bucket);
    // Два режима загрузки точек:
    // 1) без закреплённой территории — рамка карты (точка + масштаб), параметрами LATITUDE/LONGITUDE;
    // 2) закреплён регион и/или место — только эти точки, параметром REGION.
    const frame = !state.territory && loadedFrame?.covers(view.bounds) ? loadedFrame : viewFrame(view.bounds);
    const cacheKey = state.territory ? String(state.territory.id) : frame.key;
    if (!bucket.has(cacheKey)) {
      $("#chart-period").textContent = `${start} — ${end}`;
      // Бэкенд ещё не умеет рамку (в /dtp/filter_fields нет LATITUDE) — режим карты
      // деградирует в регион под центром видимой области
      const fallback = !state.territory && !state.bboxSupported ? await regionAtCenter(view.bounds) : null;
      if (state.dataLoadId !== loadId) return;
      const items: any[] = [];
      // Каждый запрос — не больше месяца; месяцы запрашиваем последовательно (сервер слабый)
      for (const chunk of chunks) {
        if (state.dataLoadId !== loadId) return;
        const query = new URLSearchParams({ DATE_TIME_FROM:`${chunk.from}T00:00:00`, DATE_TIME_TO:`${chunk.to}T23:59:59` });
        const regionId = state.territory ? state.territory.id : fallback;
        if (regionId !== null) query.set("REGION", String(regionId));
        else if (state.bboxSupported) {
          query.set("LATITUDE_FROM", String(frame.south)); query.set("LATITUDE_TO", String(frame.north));
          query.set("LONGITUDE_FROM", String(frame.west)); query.set("LONGITUDE_TO", String(frame.east));
        } else { bucket.set(cacheKey, []); break; } // видимая область вне регионов РФ
        server.forEach((value, key) => query.append(key, value));
        const response = await fetch(`${api}/dtp/points?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("API unavailable");
        items.push(...pointItems(await response.json()));
      }
      bucket.set(cacheKey, items);
      if (state.dataLoadId !== loadId) return;
      if (!state.territory) loadedFrame = frame;
      renderAdvancedFilters();
    }
    // Пересобираем rawItems только когда набор реально изменился
    const mergedKey = `${bucketKey}|${cacheKey}`;
    if (state.rawItemsKey !== mergedKey) {
      state.rawItemsKey = mergedKey;
      state.rawItems = bucket.get(cacheKey) ?? [];
    }
    renderMapData(view);
  } catch (error) {
    if (error.name !== "AbortError") setStatus(t("unavailable"));
  }
}

async function loadFilters() {
  try {
    const fieldsResponse = await fetch(`${api}/dtp/filter_fields`);
    if (!fieldsResponse.ok) throw new Error("API unavailable");
    // Секции проф-фильтра: EM_TYPE фильтруется на клиенте (поле em_type_id есть в точках),
    // серверные секции (serverSections) уходят параметрами в /dtp/points
    const fields = await fieldsResponse.json(), advancedFields = fields.filter((field) => field.name === "EM_TYPE" || serverSections.includes(field.name));
    // Рамка видимой области доступна, только если бэкенд знает LATITUDE/LONGITUDE
    state.bboxSupported = fields.some((field) => field.name === "LATITUDE");
    const dictionaries = await Promise.all(advancedFields.map(async (field) => { const response = await fetch(`${api}/dict/${field.dict}`); return [field, response.ok ? await response.json() : []]; }));
    // В emTypeNames идут только виды ДТП: id других словарей пересекаются и сломают попапы
    for (const [field, values] of dictionaries) if (field.name === "EM_TYPE") for (const value of values) emTypeNames.set(Number(value.id), value.name);
    const end = new Date(dataRange.max), start = new Date(end); start.setDate(1); start.setMonth(start.getMonth() - 11);
    $("#start-date").value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`; $("#end-date").value = dataRange.max; state.minDate = dataRange.min; state.maxDate = dataRange.max;
    state.filters = enrichFilters([
      { name:"participant_categories", values:[
        { preview:"Все участники", value:1, default:true },
        { preview:"Пешеходы", value:2 },
        { preview:"Велосипедисты", value:3 },
        { preview:"Мотоциклисты", value:4 },
        { preview:"Общ. транспорт", value:5 },
        { preview:"Дети", value:6 },
      ] },
      { name:"severity", values:[{ preview:"Без пострадавших", value:0, ui_tone:"none" }, { preview:"Лёгкий", value:1, ui_tone:"light" }, { preview:"Тяжёлый", value:3, ui_tone:"serious" }, { preview:"С погибшими", value:4, ui_tone:"fatal" }] },
      ...dictionaries.map(([field, values]) => ({ name:field.name, key:field.name === "EM_TYPE" ? "category" : field.name, param:`${field.name}_IDS`, label:t(serverSectionLabels[field.name]) || field.caption, values:values.map((value) => ({ value:value.id, preview:value.name })) })),
      { name:"masks", key:"masks", param:"masks", label:t("signs"), values:maskFeatures.map(({ value, preview }) => ({ value, preview })) },
      { name:"intervals", key:"intervals", param:"intervals", label:t("quantity"), values:intervalFields },
    ]);
    state.participants = (state.filters.find((filter) => filter.name === "participant_categories")?.values || []).map((participant) => ({ ...participant, selected: Boolean(participant.default) }));
    fetch(`${api}/dict/regions`).then((response) => response.ok ? response.json() : []).then((rows) => {
      for (const row of rows || []) if (row?.name && row.id !== 1) regionIndex.push({ id:Number(row.id), name:String(row.name), lower:String(row.name).toLowerCase() });
      // Прямая ссылка на территорию (?region=<id>) — закрепляем её и центрируем карту
      const regionId = Number(mapQuery.get("region"));
      if (Number.isFinite(regionId) && regionId > 0) selectRegion(regionIndex.find((region) => region.id === regionId) || { id:regionId, name:String(regionId) });
    }).catch(() => {});
    applyLanguage();
    updateTerritoryCard();
    // Прямая ссылка на территорию (?region=<id>) закрепляет её и сама грузит точки —
    // стартовая загрузка по рамке тут не нужна, selectRegion вызовет loadMapData
    if (!mapQuery.get("region")) loadMapData();
  } catch { setStatus(t("unavailable")); }
}

const reload = () => loadMapData();
$("#start-date").addEventListener("change", reload);
$("#end-date").addEventListener("change", reload);
$("#date-range-button").addEventListener("click", openMonthPicker);
$("#advanced-date-range-button").addEventListener("click", openMonthPicker);
$("#advanced-region").addEventListener("change", async (event) => {
  const select = event.target as HTMLSelectElement, id = Number(select.value);
  if (!id) { state.territory = null; updateTerritoryCard(); loadMapData(); }
  else {
    const region = regionIndex.find((item) => item.id === id);
    if (region) await selectRegion(region);
  }
  select.value = state.territory ? String(state.territory.id) : "";
});
document.querySelectorAll('input[name="severity"]').forEach((input) => input.addEventListener("change", reload));
$("#close-advanced").addEventListener("click", closeAdvanced);
$("#back-to-basic").addEventListener("click", closeAdvanced);
$("#apply-advanced").addEventListener("click", () => { closeAdvanced(); loadMapData(); });
function setFiltersCollapsed(collapsed) { $("#filters").classList.toggle("collapsed", collapsed); document.body.classList.toggle("filters-collapsed", collapsed); $("#hide-filters").textContent = collapsed ? activeFiltersLabel() : "‹"; $("#hide-filters").setAttribute("aria-expanded", String(!collapsed)); if (collapsed) { $("#advanced-filter").hidden = true; $("#filters").hidden = false; } }
let defaultPeriod: { start: string; end: string } | null = null;
let defaultParticipants = "";
function activeFiltersCount() {
  if (!defaultPeriod) defaultPeriod = period();
  if (!defaultParticipants) defaultParticipants = selectedParticipants().sort().join(",");
  const { start, end } = period();
  let count = 0;
  if (start !== defaultPeriod.start || end !== defaultPeriod.end) count++;
  if (state.territory) count++;
  if (selectedParticipants().sort().join(",") !== defaultParticipants) count++;
  const severityInputs = [...document.querySelectorAll('input[name="severity"]')] as HTMLInputElement[];
  if (severityInputs.length && severityInputs.some((input) => !input.checked)) count++;
  if (serverQuery().size) count++;
  return count;
}
function activeFiltersLabel() {
  const count = activeFiltersCount();
  if (state.language !== "ru") return `${t("filters")} (${count} active)`;
  return `${t("filters")} (${count} ${count % 10 === 1 && count % 100 !== 11 ? "активный" : "активных"})`;
}
$("#hide-filters").addEventListener("click", () => setFiltersCollapsed(!$("#filters").classList.contains("collapsed")));
if (matchMedia("(max-width: 800px)").matches) setFiltersCollapsed(true);
$("#professional-toggle").addEventListener("click", openAdvanced);
$("#region-search").addEventListener("input", drawRegionSuggest);
$("#region-search").addEventListener("focus", drawRegionSuggest);
$("#lock-button").addEventListener("click", () => { if (!state.territory) return; state.territory = null; updateTerritoryCard(); loadMapData(); });
document.addEventListener("click", (event) => { if (!(event.target as Element).closest(".region-search")) $("#region-suggest").hidden = true; });
document.querySelectorAll("[data-quick-map]").forEach((button) => button.addEventListener("click", () => switchMapClient(button.dataset.quickMap as "leaflet" | "yandex" | "mapbox")));
$("#chart-button").addEventListener("click", () => { $("#chart").hidden = false; renderChart(); });
$("#close-chart").addEventListener("click", () => { $("#chart").hidden = true; });
$("#chart-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  state.chartMode = button.dataset.mode;
  document.querySelectorAll("#chart-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  renderChart();
});
function renderHeatControls() {
  const remoteActive = state.mapClient === "yandex" || state.mapClient === "mapbox", remoteRadius = state.mapClient === "mapbox" ? mapboxHeatSettings.radius : yandexHeatSettings.radius, remoteIntensity = state.mapClient === "mapbox" ? mapboxHeatSettings.intensity : yandexHeatSettings.intensityOfMidpoint, remoteOpacity = state.mapClient === "mapbox" ? mapboxHeatSettings.opacity : yandexHeatSettings.opacity;
  $("#heat-blur-label").textContent = t(remoteActive ? "heatIntensity" : "heatBlur"); $("#heat-opacity-label").textContent = t(remoteActive ? "heatMapOpacity" : "heatOpacity");
  if (remoteActive) { $("#heat-radius").max = state.mapClient === "mapbox" ? "100" : "30"; $("#heat-radius").value = String(remoteRadius); $("#heat-blur").min = "1"; $("#heat-blur").max = "100"; $("#heat-blur").value = String(remoteIntensity * 100); $("#heat-opacity").max = "100"; $("#heat-opacity").value = String(remoteOpacity * 100); $("#heat-radius-value").textContent = `${remoteRadius} px`; $("#heat-blur-value").textContent = `${Math.round(remoteIntensity * 100)}%`; $("#heat-opacity-value").textContent = `${Math.round(remoteOpacity * 100)}%`; return; }
  $("#heat-radius").max = "30"; $("#heat-radius").value = String(heatSettings.radius); $("#heat-blur").min = "0"; $("#heat-blur").max = "30"; $("#heat-blur").value = String(heatSettings.blur); $("#heat-opacity").max = "50"; $("#heat-opacity").value = String(heatSettings.minOpacity * 100); $("#heat-radius-value").textContent = `${heatSettings.radius} px`; $("#heat-blur-value").textContent = `${heatSettings.blur} px`; $("#heat-opacity-value").textContent = `${Math.round(heatSettings.minOpacity * 100)}%`;
}
function updateHeatControls() {
  if (state.mapClient === "yandex") { yandexHeatSettings.radius = Number($("#heat-radius").value); yandexHeatSettings.intensityOfMidpoint = Number($("#heat-blur").value) / 100; yandexHeatSettings.opacity = Number($("#heat-opacity").value) / 100; drawYandexHeat(lastRender.heatPoints, lastRender.heatVisible); }
  else if (state.mapClient === "mapbox") { mapboxHeatSettings.radius = Number($("#heat-radius").value); mapboxHeatSettings.intensity = Number($("#heat-blur").value) / 100; mapboxHeatSettings.opacity = Number($("#heat-opacity").value) / 100; renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); }
  else { heatSettings.radius = Number($("#heat-radius").value); heatSettings.blur = Number($("#heat-blur").value); heatSettings.minOpacity = Number($("#heat-opacity").value) / 100; heat.setOptions(heatSettings); }
  renderHeatControls();
}
document.querySelectorAll("#heat-controls input").forEach((input) => input.addEventListener("input", updateHeatControls));
let moveTimer;
function scheduleMapLoad() { clearTimeout(moveTimer); state.abort?.abort(); state.dataLoadId++; moveTimer = setTimeout(loadMapData, 350); }
map.on("moveend", () => { if (state.mapClient === "leaflet") scheduleMapLoad(); });
applyLanguage();
const savedMapClient = state.mapClient; state.mapClient = "leaflet"; renderMapSwitcher(); if (savedMapClient !== "leaflet") switchMapClient(savedMapClient);
loadFilters();
