const api = "https://dtpstat-api.dexoon.workers.dev/api";
const $ = (selector) => document.querySelector(selector);
type MonthPickerState = { open: boolean; target: "start" | "end"; year: number | null; start: string; end: string };
type MapState = { language: string; mapClient: "leaflet" | "yandex" | "mapbox"; participants: any[]; filters: any[]; regions: any[]; selectedFilters: Record<string, any[]>; activeFilter: string | null; abort: AbortController | null; items: any[]; chartMode: string; minDate: string; maxDate: string; picker: MonthPickerState };
const persistedMapClient = localStorage.getItem("map-client");
const state: MapState = { language: new URLSearchParams(location.search).get("lang") || localStorage.getItem("language") || "ru", mapClient: persistedMapClient === "yandex" || persistedMapClient === "mapbox" ? persistedMapClient : "leaflet", participants: [], filters: [], regions: [], selectedFilters: {}, activeFilter: null, abort: null, items: [], chartMode: "days", minDate: "2015-01-01", maxDate: "2024-12-31", picker: { open: false, target: "start", year: null, start: "2024-01-01", end: "2024-12-31" } };
const copy = {
  ru: { brandAria:"Карта ДТП — главная", mapAria:"Интерактивная карта ДТП", mapSource:"Выбрать карту", map:"Карта", blog:"Блог и исследования", data:"Скачать данные", about:"О проекте", team:"Команда", support:"Поддержать проект", statistics:"Статистика", filters:"Фильтры", analytics:"Аналитика", apply:"Применить", cancel:"Отмена", allTime:"За всё время", basicFilter:"Базовый фильтр", professionalFilter:"Профессиональный фильтр", startPeriod:"Начало периода", endPeriod:"Конец периода", chooseYear:"Выберите год", chooseMonth:"Выберите месяц", search:"Поиск", dataPeriod:"Период данных", accidentsInRussia:"ДТП в России", region:"Регион", allRegions:"Все регионы", from:"С", to:"По", participants:"Участники ДТП", injurySeverity:"Вред здоровью", light:"Лёгкий", serious:"Тяжёлый", fatal:"С погибшими", accidentTypes:"Типы ДТП", violations:"Нарушения ПДД", weather:"Погода", streets:"Улицы", heatRadius:"Радиус", heatBlur:"Размытие", heatOpacity:"Мин. непрозрачность", loading:"Загружаем данные…", loadingMap:"Обновляем карту…", unavailable:"Не удалось получить данные. Попробуйте позднее.", officialData:"Официальные данные", accidents:"ДТП", injured:"Пострадали", dead:"Погибли", distribution:"Распределение по дням", selectedPeriod:"За выбранный период", byDays:"По дням", byHours:"По часам", byTypes:"По типам ДТП", chartNote:"Диаграмма построена по ДТП в видимой области.", accidentsInArea:"ДТП в видимой области", people:"чел.", deaths:"погибших" },
  en: { brandAria:"Road accident map — home", mapAria:"Interactive road accident map", mapSource:"Choose map", map:"Map", blog:"Blog & research", data:"Download data", about:"About the project", team:"Team", support:"Support the project", statistics:"Statistics", filters:"Filters", analytics:"Analytics", apply:"Apply", cancel:"Cancel", allTime:"All time", basicFilter:"Basic filter", professionalFilter:"Professional filter", startPeriod:"Start of period", endPeriod:"End of period", chooseYear:"Select year", chooseMonth:"Select month", search:"Search", dataPeriod:"Data period", accidentsInRussia:"Road accidents in Russia", region:"Region", allRegions:"All regions", from:"From", to:"To", participants:"Road users", injurySeverity:"Injury severity", light:"Minor", serious:"Serious", fatal:"Fatal", accidentTypes:"Accident types", violations:"Traffic violations", weather:"Weather", streets:"Streets", heatRadius:"Radius", heatBlur:"Blur", heatOpacity:"Min. opacity", loading:"Loading data…", loadingMap:"Updating map…", unavailable:"Could not load data. Please try again later.", officialData:"Official data", accidents:"Accidents", injured:"Injured", dead:"Deaths", distribution:"Distribution by day", selectedPeriod:"Selected period", byDays:"By day", byHours:"By hour", byTypes:"By type", chartNote:"The chart is based on accidents in the visible area.", accidentsInArea:"Accidents in area", people:"people", deaths:"deaths" },
};
Object.assign(copy.ru, { regionSearch:"Введите адрес или регион", noInjured:"Без пострадавших (нет данных)", accidentKind:"Вид ДТП", show:"Показать" });
Object.assign(copy.en, { regionSearch:"Enter address or region", noInjured:"No injuries (no data)", accidentKind:"Accident type", show:"Show" });
Object.assign(copy.ru, { heatIntensity:"Интенсивность", heatMapOpacity:"Непрозрачность" });
Object.assign(copy.en, { heatIntensity:"Intensity", heatMapOpacity:"Opacity" });
const participantTranslations = { "Все участники":"All users", "Пешеходы":"Pedestrians", "Велосипедисты":"Cyclists", "Мотоциклисты":"Motorcyclists", "Общ. транспорт":"Public transport", "Дети":"Children", "Без участника":"No road user" };
const participantIcons = ["all", "pedestrian", "cyclist", "motorcycle", "public_transport", "kids", "driver"];
const number = () => new Intl.NumberFormat(state.language === "ru" ? "ru-RU" : "en-US");
const t = (key) => copy[state.language][key];

function period() { return { start: $("#start-date").value, end: $("#end-date").value }; }
function severity() { return [...document.querySelectorAll('input[name="severity"]:checked')].map((input) => Number(input.value)); }
function selectedParticipants() { return state.participants.filter((participant) => participant.selected).map((participant) => participant.value); }
function selectedRegion() { return $("#region-filter").value; }
function setStatus(message) { $("#filter-status").textContent = message; }
function monthValue(value) { return value.slice(0, 7); }
function monthStartValue(value) { return `${value}-01`; }
function monthEndValue(value) { const [year, month] = value.split("-").map(Number); return `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`; }
function displayMonth(value) { return new Intl.DateTimeFormat(state.language === "ru" ? "ru-RU" : "en-US", { month: "long", year: "numeric" }).format(new Date(`${value}-01T00:00:00`)); }

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
  months.replaceChildren(...Array.from({ length: 12 }, (_, index) => { const value = `${year}-${String(index + 1).padStart(2, "0")}`, button = document.createElement("button"); button.type = "button"; button.textContent = new Intl.DateTimeFormat(state.language === "ru" ? "ru-RU" : "en-US", { month: "long" }).format(new Date(year, index, 1)); button.disabled = value < minimum || value > maximum || (target === "end" && value < selectedStart); button.classList.toggle("active", value === monthValue(target === "start" ? state.picker.start : state.picker.end)); button.addEventListener("click", () => selectPickerMonth(value)); return button; }));
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
  $("#language").textContent = state.language === "ru" ? "EN" : "RU";
  $("#advanced-search").placeholder = t("search");
  renderRegions();
  renderParticipants();
  renderAdvancedControls();
  renderDateFields();
  renderMonthPicker();
  renderHeatControls();
}

function renderRegions() {
  const current = $("#region-filter").value;
  document.querySelectorAll("#region-filter, #advanced-region-filter").forEach((select) => { select.replaceChildren(new Option(t("regionSearch"), ""), ...state.regions.map((region) => new Option(region.name, region.slug))); select.value = state.regions.some((region) => region.slug === current) ? current : ""; });
}

function renderParticipants() {
  const root = $("#participants");
  root.replaceChildren(...state.participants.slice(0, 6).map((participant) => {
    const button = document.createElement("button");
    button.type = "button";
    const icon = document.createElement("img"); icon.src = `assets/icons/${participantIcons[state.participants.indexOf(participant)] || "driver"}.svg`; icon.alt = "";
    const label = document.createElement("span"); label.textContent = state.language === "en" ? (participantTranslations[participant.preview] || participant.preview) : participant.preview;
    button.append(icon, label);
    button.classList.toggle("active", participant.selected);
    button.setAttribute("aria-pressed", String(participant.selected));
    button.addEventListener("click", () => { state.participants.forEach((item) => { item.selected = item.value === participant.value; }); renderParticipants(); loadMapData(); });
    return button;
  }));
  $("#collapsed-summary").textContent = state.participants.filter((participant) => participant.selected).map((participant) => state.language === "en" ? (participantTranslations[participant.preview] || participant.preview) : participant.preview).join(", ");
}
function renderAdvancedControls() {
  const participants = $("#advanced-participants"), severity = $("#advanced-severity");
  participants.replaceChildren(...state.participants.map((participant) => { const label = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.checked = participant.selected; input.addEventListener("change", () => { participant.selected = input.checked; renderParticipants(); }); label.append(input, document.createTextNode(state.language === "en" ? (participantTranslations[participant.preview] || participant.preview) : participant.preview)); return label; }));
  severity.replaceChildren(...[...document.querySelectorAll<HTMLInputElement>('input[name="severity"]')].map((source) => { const label = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.checked = source.checked; input.disabled = source.disabled; input.addEventListener("change", () => { source.checked = input.checked; }); label.append(input, document.createTextNode(source.parentElement.textContent.trim())); return label; }));
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

const mapQuery = new URLSearchParams(location.search), initialCenter = (mapQuery.get("center") || "").split(":").map(Number), initialZoom = Number(mapQuery.get("zoom"));
const map = L.map("leaflet-map", { zoomControl: false, minZoom: 4 }).setView(initialCenter.length === 2 && initialCenter.every(Number.isFinite) ? initialCenter : [55.76, 37.64], Number.isFinite(initialZoom) ? initialZoom : 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
const accidents = L.layerGroup().addTo(map);
const heatSettings = { radius: 6, blur: 9, minOpacity: .05 };
const heat = L.heatLayer([], { ...heatSettings, maxZoom: 12, gradient: { 0:"rgba(126, 171, 85, 0.0)", .2:"rgba(126, 171, 85, 0.6)", .4:"rgba(255, 254, 85, 0.7)", .6:"rgba(245, 193, 66, 0.8)", .8:"rgba(223, 130, 68, 0.9)", 1:"rgba(176, 36, 24, 1)" } }).addTo(map);
const yandexHeatSettings = { radius: 15, opacity: .5, intensityOfMidpoint: .5 };
const yandex = { map: null as any, points: null as any, heat: null as any, render: null as any, loading: null as Promise<void> };
const mapboxHeatSettings = { radius: 15, opacity: .5, intensity: .5 };
const mapbox = { map: null as any, render: null as any, loading: null as Promise<void> };
function mapboxHeatPaint() {
  const { radius, intensity, opacity } = mapboxHeatSettings;
  return { radius:["interpolate", ["linear"], ["zoom"], 4, radius * .75, 7, radius * .9, 10, radius, 12, radius * 1.15], intensity:["interpolate", ["linear"], ["zoom"], 4, intensity * .7, 7, intensity * .85, 10, intensity, 12, intensity * 1.1], opacity };
}

function leafletView() { const bounds = map.getBounds(), center = map.getCenter(); return { center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom(), bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }; }
function yandexView() { const center = yandex.map.getCenter(), bounds = yandex.map.getBounds(); return { center: { latitude: center[1], longitude: center[0] }, zoom: yandex.map.getZoom(), bounds: { west: bounds[0][0], south: bounds[0][1], east: bounds[1][0], north: bounds[1][1] } }; }
function mapboxView() { const center = mapbox.map.getCenter(), bounds = mapbox.map.getBounds(); return { center: { latitude: center.lat, longitude: center.lng }, zoom: mapbox.map.getZoom(), bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }; }
function currentView() { return state.mapClient === "yandex" && yandex.map ? yandexView() : state.mapClient === "mapbox" && mapbox.map ? mapboxView() : leafletView(); }
function heatFeatures(items, maximum) { return items.map((item) => ({ type: "Feature", geometry: { type: "Point", coordinates: [item.longitude, item.latitude] }, properties: { weight: item.count / maximum } })); }
function renderLeaflet(visible, heatItems, maximum, heatVisible) {
  accidents.clearLayers(); heat.setLatLngs([]);
  if (heatVisible) { heat.setOptions(heatSettings); heat.setLatLngs(heatItems.map((item) => [item.latitude, item.longitude, item.count])); }
  else visible.forEach((item) => L.circleMarker([item.point.latitude, item.point.longitude], { radius: item.severity === 4 ? 7 : 5, color: "#fff", weight: 1, fillColor: markerColor(item), fillOpacity: .9 }).bindPopup(markerPopup(item)).addTo(accidents));
}
function renderYandex(visible, heatItems, maximum, heatVisible) {
  yandex.render = { visible, heatItems, maximum, heatVisible };
  if (!yandex.map) return;
  yandex.points.removeAll();
  yandex.heat?.options.set(yandexHeatSettings);
  yandex.heat?.setData(heatVisible ? heatFeatures(heatItems, maximum) : []);
  if (!heatVisible) visible.forEach((item) => yandex.points.add(new (window as any).ymaps.Placemark([item.point.longitude, item.point.latitude], { balloonContent: markerPopup(item) }, { preset: `islands#${item.severity === 4 ? "red" : item.severity === 3 ? "orange" : "yellow"}CircleDotIcon` })));
}
function renderMapbox(visible, heatItems, maximum, heatVisible) {
  mapbox.render = { visible, heatItems, maximum, heatVisible };
  if (!mapbox.map?.isStyleLoaded()) return;
  mapbox.map.getSource("dtp-heat")?.setData({ type:"FeatureCollection", features: heatVisible ? heatFeatures(heatItems, maximum) : [] });
  mapbox.map.getSource("dtp-points")?.setData({ type:"FeatureCollection", features: heatVisible ? [] : visible.map((item) => ({ type:"Feature", geometry:{ type:"Point", coordinates:[item.point.longitude, item.point.latitude] }, properties:{ severity:item.severity, popup:markerPopup(item) } })) });
  const paint = mapboxHeatPaint();
  mapbox.map.setPaintProperty("dtp-heat", "heatmap-radius", paint.radius); mapbox.map.setPaintProperty("dtp-heat", "heatmap-intensity", paint.intensity); mapbox.map.setPaintProperty("dtp-heat", "heatmap-opacity", paint.opacity);
}
function loadScript(src) { return new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error("Yandex Maps unavailable")); document.head.append(script); }); }
function loadYandexScript() {
  const key = (window as any).YANDEX_MAPS_KEY;
  if (!key) return Promise.reject(new Error("Yandex Maps key is missing"));
  if (!yandex.loading) yandex.loading = ((window as any).ymaps ? Promise.resolve() : loadScript(`https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=${state.language === "ru" ? "ru_RU" : "en_US"}&coordorder=longlat`)).then(() => loadScript("https://yastatic.net/s3/mapsapi-jslibs/heatmap/0.0.1/heatmap.min.js"));
  return yandex.loading;
}
async function ensureYandex(view) {
  if (yandex.map) { yandex.map.setCenter([view.center.longitude, view.center.latitude], view.zoom); return; }
  await loadYandexScript();
  const ymaps = (window as any).ymaps;
  await ymaps.ready(["Heatmap"]);
  yandex.map = new ymaps.Map("yandex-map", { center: [view.center.longitude, view.center.latitude], zoom: view.zoom, controls: ["zoomControl"] }, { maxZoom: 20, minZoom: 1, avoidFractionalZoom: true, yandexMapDisablePoiInteractivity: true, suppressMapOpenBlock: true });
  yandex.points = new ymaps.GeoObjectCollection(); yandex.map.geoObjects.add(yandex.points);
  yandex.heat = new ymaps.Heatmap([], { ...yandexHeatSettings, dissipating: false, gradient: { 0: "rgba(126, 171, 85, 0.0)", .2: "rgba(126, 171, 85, 0.6)", .4: "rgba(255, 254, 85, 0.7)", .6: "rgba(245, 193, 66, 0.8)", .8: "rgba(223, 130, 68, 0.9)", 1: "rgba(176, 36, 24, 1)" } });
  yandex.heat.setMap(yandex.map, {}); if (yandex.render) renderYandex(yandex.render.visible, yandex.render.heatItems, yandex.render.maximum, yandex.render.heatVisible);
  yandex.map.events.add("boundschange", () => { if (state.mapClient !== "yandex") return; const current = yandexView(); map.setView([current.center.latitude, current.center.longitude], current.zoom, { animate: false }); scheduleMapLoad(); });
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
    mapbox.map.addLayer({ id:"dtp-points", type:"circle", source:"dtp-points", paint:{ "circle-radius":["case", ["==", ["get", "severity"], 4], 7, 5], "circle-color":["match", ["get", "severity"], 4,"#e31a1c", 3,"#ff7f24", "#fecc5c"], "circle-stroke-color":"#fff", "circle-stroke-width":1, "circle-opacity":.9 } });
    mapbox.map.on("click", "dtp-points", (event) => new mapboxgl.Popup().setLngLat(event.features[0].geometry.coordinates).setHTML(event.features[0].properties.popup).addTo(mapbox.map));
    if (mapbox.render) renderMapbox(mapbox.render.visible, mapbox.render.heatItems, mapbox.render.maximum, mapbox.render.heatVisible);
  });
  mapbox.map.on("moveend", () => { if (state.mapClient !== "mapbox") return; const current = mapboxView(); map.setView([current.center.latitude, current.center.longitude], current.zoom, { animate:false }); scheduleMapLoad(); });
}
function renderMapSwitcher() { document.querySelectorAll("[data-map-client], [data-quick-map]").forEach((button) => button.classList.toggle("active", (button.dataset.mapClient || button.dataset.quickMap) === state.mapClient)); }
async function switchMapClient(client) {
  if (client === state.mapClient) return;
  const view = currentView(); state.mapClient = client; localStorage.setItem("map-client", client); renderMapSwitcher(); renderHeatControls();
  $("#leaflet-map").hidden = client !== "leaflet"; $("#yandex-map").hidden = client !== "yandex"; $("#mapbox-map").hidden = client !== "mapbox";
  if (client === "leaflet") { map.setView([view.center.latitude, view.center.longitude], view.zoom, { animate: false }); map.invalidateSize(); return; }
  try {
    if (client === "yandex") { await ensureYandex(view); if (yandex.render) renderYandex(yandex.render.visible, yandex.render.heatItems, yandex.render.maximum, yandex.render.heatVisible); }
    else { await ensureMapbox(view); if (mapbox.render) renderMapbox(mapbox.render.visible, mapbox.render.heatItems, mapbox.render.maximum, mapbox.render.heatVisible); mapbox.map.resize(); }
  } catch { state.mapClient = "leaflet"; localStorage.setItem("map-client", "leaflet"); $("#yandex-map").hidden = true; $("#mapbox-map").hidden = true; $("#leaflet-map").hidden = false; renderMapSwitcher(); renderHeatControls(); setStatus(t("unavailable")); }
}

function boundsPolygon() {
  const bounds = currentView().bounds;
  return [[bounds.west, bounds.south], [bounds.east, bounds.south], [bounds.east, bounds.north], [bounds.west, bounds.north], [bounds.west, bounds.south]].map((point) => point.map((value) => value.toFixed(6)).join(" ")).join(",");
}
function markerColor(item) { return item.severity === 4 ? "#e31a1c" : item.severity === 3 ? "#ff7f24" : "#fecc5c"; }
function markerPopup(item) {
  const place = item.address || item.street || t("accidentsInArea");
  const escape = (value) => String(value || "").replace(/[&<>\"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" })[character]);
  const details = state.language === "en" ? "Accident details" : "Подробности ДТП";
  return `<div class="marker-popup"><strong>${escape(item.category_name)}</strong><span>${escape(item.datetime.slice(0, 16).replace("T", ", "))}</span><span>${escape(place)}</span><small>${number().format(item.injured)} ${t("people")} · ${number().format(item.dead)} ${t("deaths")}</small><a href="details/?id=${encodeURIComponent(item.id)}&lang=${state.language}">${details}</a></div>`;
}
function filterDefinition(key) { return state.filters.find((filter) => (filter.key || filter.name) === key); }
function renderAdvancedOptions() {
  const filter = filterDefinition(state.activeFilter);
  const query = $("#advanced-search").value.trim().toLowerCase();
  const selected = state.selectedFilters[state.activeFilter] || [];
  const root = $("#advanced-options");
  root.replaceChildren(...(filter?.values || []).filter((item) => item.preview.toLowerCase().includes(query)).map((item) => {
    const label = document.createElement("label");
    const input = document.createElement("input"); input.type = "checkbox"; input.value = item.value; input.checked = selected.includes(item.value);
    input.addEventListener("change", () => { const values = new Set(state.selectedFilters[state.activeFilter] || []); input.checked ? values.add(item.value) : values.delete(item.value); state.selectedFilters[state.activeFilter] = [...values]; });
    label.append(input, document.createTextNode(item.preview)); return label;
  }));
}
function openAdvanced(key) {
  const filter = filterDefinition(key); if (!filter) return;
  state.activeFilter = key; $("#advanced-search").value = ""; renderAdvancedControls(); renderAdvancedOptions(); $("#filters").hidden = true; $("#statistics").hidden = true; $("#advanced-filter").hidden = false;
}
function passesAdvancedFilters(item) {
  return Object.entries(state.selectedFilters).every(([key, values]) => !values.length || (Array.isArray(item[key]) ? item[key].some((value) => values.includes(value)) : values.includes(item[key])));
}

async function loadMapData() {
  const { start, end } = period();
  if (!start || !end || end < start) return;
  state.abort?.abort();
  state.abort = new AbortController();
  setStatus(t("loadingMap"));
  const view = currentView();
  const statQuery = new URLSearchParams({ center_point: `${view.center.longitude} ${view.center.latitude}`, scale: String(view.zoom), start_date: start, end_date: end, severity: severity().join(","), participant_categories: selectedParticipants().join(",") });
  const heatRadius = state.mapClient === "yandex" ? yandexHeatSettings.radius : state.mapClient === "mapbox" ? mapboxHeatSettings.radius : heatSettings.radius, dtpQuery = new URLSearchParams({ start_date: start, end_date: end, geo_frame: boundsPolygon(), scale: String(view.zoom), severity: severity().join(","), participant_categories: selectedParticipants().join(","), aggregate: "0", heat_radius: String(heatRadius), format: "6", heat_version: "8" }), region = selectedRegion();
  if (region) { statQuery.set("region_slug", region); dtpQuery.set("region_slug", region); }
  try {
    const statResponse = await fetch(`${api}/stat/?${statQuery}`, { signal: state.abort.signal });
    if (!statResponse.ok) throw new Error("API unavailable");
    const stat = await statResponse.json();
    const dtpResponse = await fetch(`${api}/dtp/?${dtpQuery}`, { signal: state.abort.signal });
    if (!dtpResponse.ok) throw new Error("API unavailable");
    const data = await dtpResponse.json();
    $("#region-name").textContent = stat.region_name || "—";
    $("#count").textContent = number().format(stat.count || 0);
    $("#injured").textContent = number().format(stat.injured || 0);
    $("#dead").textContent = number().format(stat.dead || 0);
    $("#chart-period").textContent = `${start} — ${end}`;
    const visible = (data.mode === "points" ? data.items : []).filter((item) => passesAdvancedFilters(item));
    state.items = visible;
    renderChart();
    const heatItems = data.mode === "points" ? visible.map((item) => ({ latitude:item.point.latitude, longitude:item.point.longitude, count:1 })) : data.items;
    const heatMaximum = Math.max(...heatItems.map((item) => item.count), 1), heatVisible = view.zoom <= 12 || data.count >= 1000;
    renderLeaflet(visible, heatItems, heatMaximum, heatVisible);
    renderYandex(visible, heatItems, heatMaximum, heatVisible);
    renderMapbox(visible, heatItems, heatMaximum, heatVisible);
    setStatus(`${number().format(data.mode === "points" ? visible.length : data.count)} ${t("accidentsInArea").toLowerCase()}`);
  } catch (error) {
    if (error.name !== "AbortError") setStatus(t("unavailable"));
  }
}

async function loadFilters() {
  try {
    const [response, regionsResponse] = await Promise.all([fetch(`${api}/filters/`), fetch(`${api}/regions`)]);
    if (!response.ok || !regionsResponse.ok) throw new Error("API unavailable");
    const [filters, regions] = await Promise.all([response.json(), regionsResponse.json()]);
    const date = filters.find((filter) => filter.name === "date")?.default_value;
    if (date) { const end = new Date(`${date.end_date}T00:00:00`); end.setDate(1); end.setMonth(end.getMonth() - 11); $("#start-date").value = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`; $("#end-date").value = date.end_date; state.maxDate = date.end_date; }
    state.filters = filters;
    state.regions = regions;
    state.participants = (filters.find((filter) => filter.name === "participant_categories")?.values || []).map((participant) => ({ ...participant, selected: participant.default }));
    applyLanguage();
    loadMapData();
  } catch { setStatus(t("unavailable")); }
}

const reload = () => loadMapData();
$("#start-date").addEventListener("change", reload);
$("#end-date").addEventListener("change", reload);
$("#date-range-button").addEventListener("click", openMonthPicker);
$("#advanced-date-range-button").addEventListener("click", openMonthPicker);
$("#region-filter").addEventListener("change", () => { renderRegions(); reload(); });
$("#advanced-region-filter").addEventListener("change", () => { $("#region-filter").value = $("#advanced-region-filter").value; renderRegions(); reload(); });
document.querySelectorAll('input[name="severity"]').forEach((input) => input.addEventListener("change", reload));
$("#advanced-search").addEventListener("input", renderAdvancedOptions);
$("#close-advanced").addEventListener("click", () => { $("#advanced-filter").hidden = true; $("#filters").hidden = false; $("#statistics").hidden = false; });
$("#apply-advanced").addEventListener("click", () => { $("#advanced-filter").hidden = true; $("#filters").hidden = false; $("#statistics").hidden = false; loadMapData(); });
function setFiltersCollapsed(collapsed) { $("#filters").classList.toggle("collapsed", collapsed); $("#hide-filters").textContent = collapsed ? t("filters") : "⌃"; $("#hide-filters").setAttribute("aria-expanded", String(!collapsed)); if (collapsed) { $("#advanced-filter").hidden = true; $("#filters").hidden = false; $("#statistics").hidden = false; } }
$("#hide-filters").addEventListener("click", () => setFiltersCollapsed(!$("#filters").classList.contains("collapsed")));
if (matchMedia("(max-width: 800px)").matches) setFiltersCollapsed(true);
$("#professional-toggle").addEventListener("click", () => openAdvanced(state.activeFilter || "category"));
document.querySelectorAll("[data-quick-map]").forEach((button) => button.addEventListener("click", () => switchMapClient(button.dataset.quickMap as "leaflet" | "yandex" | "mapbox")));
$("#chart-button").addEventListener("click", () => { $("#chart").hidden = false; });
$("#close-chart").addEventListener("click", () => { $("#chart").hidden = true; });
$("#chart-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  state.chartMode = button.dataset.mode;
  document.querySelectorAll("#chart-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  renderChart();
});
$("#language").addEventListener("click", () => { state.language = state.language === "ru" ? "en" : "ru"; localStorage.setItem("language", state.language); applyLanguage(); loadMapData(); });
$("#mobile-menu-button").addEventListener("click", () => $("#mobile-menu").showModal());
$("#close-mobile-menu").addEventListener("click", () => $("#mobile-menu").close());
$("#map-switcher-button").addEventListener("click", () => { const menu = $("#map-switcher-menu"), open = menu.hidden; menu.hidden = !open; $("#map-switcher-button").setAttribute("aria-expanded", String(open)); });
$("#map-switcher-menu").addEventListener("click", (event) => { const button = event.target.closest("[data-map-client]"); if (!button) return; $("#map-switcher-menu").hidden = true; $("#map-switcher-button").setAttribute("aria-expanded", "false"); switchMapClient(button.dataset.mapClient); });
let heatControlTimer;
function renderHeatControls() {
  const remoteActive = state.mapClient === "yandex" || state.mapClient === "mapbox", remoteRadius = state.mapClient === "mapbox" ? mapboxHeatSettings.radius : yandexHeatSettings.radius, remoteIntensity = state.mapClient === "mapbox" ? mapboxHeatSettings.intensity : yandexHeatSettings.intensityOfMidpoint, remoteOpacity = state.mapClient === "mapbox" ? mapboxHeatSettings.opacity : yandexHeatSettings.opacity;
  $("#heat-blur-label").textContent = t(remoteActive ? "heatIntensity" : "heatBlur"); $("#heat-opacity-label").textContent = t(remoteActive ? "heatMapOpacity" : "heatOpacity");
  if (remoteActive) { $("#heat-radius").max = state.mapClient === "mapbox" ? "100" : "30"; $("#heat-radius").value = String(remoteRadius); $("#heat-blur").min = "1"; $("#heat-blur").max = "100"; $("#heat-blur").value = String(remoteIntensity * 100); $("#heat-opacity").max = "100"; $("#heat-opacity").value = String(remoteOpacity * 100); $("#heat-radius-value").textContent = `${remoteRadius} px`; $("#heat-blur-value").textContent = `${Math.round(remoteIntensity * 100)}%`; $("#heat-opacity-value").textContent = `${Math.round(remoteOpacity * 100)}%`; return; }
  $("#heat-radius").max = "30"; $("#heat-radius").value = String(heatSettings.radius); $("#heat-blur").min = "0"; $("#heat-blur").max = "30"; $("#heat-blur").value = String(heatSettings.blur); $("#heat-opacity").max = "50"; $("#heat-opacity").value = String(heatSettings.minOpacity * 100); $("#heat-radius-value").textContent = `${heatSettings.radius} px`; $("#heat-blur-value").textContent = `${heatSettings.blur} px`; $("#heat-opacity-value").textContent = `${Math.round(heatSettings.minOpacity * 100)}%`;
}
function updateHeatControls() {
  if (state.mapClient === "yandex") { yandexHeatSettings.radius = Number($("#heat-radius").value); yandexHeatSettings.intensityOfMidpoint = Number($("#heat-blur").value) / 100; yandexHeatSettings.opacity = Number($("#heat-opacity").value) / 100; yandex.heat?.options.set(yandexHeatSettings); if (yandex.render) renderYandex(yandex.render.visible, yandex.render.heatItems, yandex.render.maximum, yandex.render.heatVisible); }
  else if (state.mapClient === "mapbox") { mapboxHeatSettings.radius = Number($("#heat-radius").value); mapboxHeatSettings.intensity = Number($("#heat-blur").value) / 100; mapboxHeatSettings.opacity = Number($("#heat-opacity").value) / 100; if (mapbox.render) renderMapbox(mapbox.render.visible, mapbox.render.heatItems, mapbox.render.maximum, mapbox.render.heatVisible); }
  else { heatSettings.radius = Number($("#heat-radius").value); heatSettings.blur = Number($("#heat-blur").value); heatSettings.minOpacity = Number($("#heat-opacity").value) / 100; heat.setOptions(heatSettings); }
  renderHeatControls(); clearTimeout(heatControlTimer); heatControlTimer = setTimeout(loadMapData, 180);
}
document.querySelectorAll("#heat-controls input").forEach((input) => input.addEventListener("input", updateHeatControls));
let moveTimer;
function scheduleMapLoad() { clearTimeout(moveTimer); moveTimer = setTimeout(loadMapData, 350); }
map.on("moveend", () => { if (state.mapClient === "leaflet") scheduleMapLoad(); });
applyLanguage();
const savedMapClient = state.mapClient; state.mapClient = "leaflet"; renderMapSwitcher(); if (savedMapClient !== "leaflet") switchMapClient(savedMapClient);
loadFilters();
