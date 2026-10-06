// Карта: Leaflet/Яндекс/Mapbox — инициализация, рендеры, тепло, переключение клиентов

import { $, state, setStatus, lastRender, actions, mapQuery } from "./context.js";
import { t } from "./i18n.js";
import { markerColor, markerPopup } from "./popups.js";
import { syncPopupUrl, clearPopupUrl } from "./deeplink.js";

const initialCenter = (mapQuery.get("center") || "").split(":").map(Number), zoomQuery = mapQuery.get("zoom"), initialZoom = zoomQuery === null ? NaN : Number(zoomQuery);
// preferCanvas: десятки тысяч точек рисуются на одном canvas — SVG-рендер на этом вешает вкладку.
// Кнопки +/− не показываем ни на одном клиенте (масштаб колесом/щипком)
const map = L.map("leaflet-map", { zoomControl: false, minZoom: 4, preferCanvas: true }).setView(initialCenter.length === 2 && initialCenter.every(Number.isFinite) ? initialCenter : [55.76, 37.64], Number.isFinite(initialZoom) ? initialZoom : 11);
map.on("popupopen", (event: any) => { const item = popupItems.get(event.popup); if (item) syncPopupUrl(item.id, item.point.latitude, item.point.longitude, map.getZoom()); });
map.on("popupclose", clearPopupUrl);
// Префикс атрибуции по умолчанию содержит флаг (svg) перед «Leaflet» — оставляем просто ссылку
map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>');
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
const accidents = L.layerGroup().addTo(map);
const markers = new Map<string, any>();
// Попап → точка: по нему popupopen узнаёт, какое ДТП открыто (для адресной строки)
const popupItems = new WeakMap<object, any>();
const heatSettings = { radius: 6, blur: 9, minOpacity: .05 };
const heatGradient = { 0: "rgba(126, 171, 85, 0)", .2: "rgba(126, 171, 85, 0.6)", .4: "rgba(255, 254, 85, 0.7)", .6: "rgba(245, 193, 66, 0.8)", .8: "rgba(223, 130, 68, 0.9)", 1: "rgba(176, 36, 24, 1)" };
const heat = L.heatLayer([], { ...heatSettings, maxZoom: 12, gradient: heatGradient }).addTo(map);
const yandexHeatSettings = { radius: 15, opacity: .5, intensityOfMidpoint: .5 };
const yandex = { map: null as any, points: null as any, mask: null as any, heatCanvas: null as HTMLCanvasElement | null, heatCtx: null as CanvasRenderingContext2D | null, loading: null as Promise<void> };
const mapboxHeatSettings = { radius: 15, opacity: .5, intensity: .5 };
const mapbox = { map: null as any, loading: null as Promise<void> };
// Флаг зум-жеста: тепло Mapbox на время жеста скрыто (DTP-30)
let mapboxHeatHold = false;
function mapboxHeatPaint() {
  const { radius, intensity, opacity } = mapboxHeatSettings;
  return { radius:["interpolate", ["linear"], ["zoom"], 4, radius * .75, 7, radius * .9, 10, radius, 12, radius * 1.15], intensity:["interpolate", ["linear"], ["zoom"], 4, intensity * .7, 7, intensity * .85, 10, intensity, 12, intensity * 1.1], opacity };
}

function leafletView() { const bounds = map.getBounds(), center = map.getCenter(); return { center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom(), bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }; }
function yandexView() { const center = yandex.map.getCenter(), bounds = yandex.map.getBounds(); return { center: { latitude: center[1], longitude: center[0] }, zoom: yandex.map.getZoom(), bounds: { west: bounds[0][0], south: bounds[0][1], east: bounds[1][0], north: bounds[1][1] } }; }
function mapboxView() { const center = mapbox.map.getCenter(), bounds = mapbox.map.getBounds(); return { center: { latitude: center.lat, longitude: center.lng }, zoom: mapbox.map.getZoom(), bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }; }
function currentView() { return state.mapClient === "yandex" && yandex.map ? yandexView() : state.mapClient === "mapbox" && mapbox.map ? mapboxView() : leafletView(); }
function heatFeatures(points) { return points.map(([latitude, longitude, weight]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [longitude, latitude] }, properties: { weight: weight || 1 } })); }
// Тепловая карта живёт на отдалённом масштабе (регион/город), при приближении
// сменяется точками; точки появляются с зума 13
const heatZoomMax = 13;
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
// Canvas-рендер тянет десятки тысяч точек, но на общероссийском зуме ограничиваем выборку —
// плотность и так сливается в сплошную массу
const leafletMarkerLimit = 30000;
function renderMarkers(markersVisible) {
  const visible = (markersVisible.length > leafletMarkerLimit ? markersVisible.slice(0, leafletMarkerLimit) : markersVisible);
  // Добавляем/убираем только изменившиеся маркеры вместо полной пересборки слоя
  const alive = new Set(visible.map((item) => item.id));
  for (const [id, marker] of markers) if (!alive.has(id)) { marker.remove(); markers.delete(id); }
  // Плоские точки без обводки — как на dtp-stat.ru
  for (const item of visible) if (!markers.has(item.id)) {
    const marker = L.circleMarker([item.point.latitude, item.point.longitude], { radius: 5, weight: 0, fillColor: markerColor(item), fillOpacity: 1 }).bindPopup(markerPopup(item)).addTo(accidents);
    popupItems.set(marker.getPopup(), item);
    markers.set(item.id, marker);
  }
}
function renderLeaflet(visible, heatPoints, heatVisible) {
  renderMarkers(heatVisible ? [] : visible);
  heat.setLatLngs(heatVisible ? heatPoints : []);
}
const yandexMarkers = new Map<string, { placemark: any; latitude: number }>();
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
// Якорь отрисовки в глобальных пикселях: по нему тепло догоняет карту
// transform-сдвигом, не перерисовываясь
let yandexHeatAnchor: { x: number; y: number; zoom: number } | null = null;
// Идёт зум-жест (DTP-30): полотно держим невидимым до actionend, перерисовки
// посреди жеста видимость не возвращают
let yandexHeatZoomHold = false;
// Полотно больше экрана на поля: во время перетаскивания canvas следует за картой
// сдвигом, и по краям не успевает появиться пустая полоса
const yandexHeatMargin = 200;
function drawYandexHeat(heatPoints, heatVisible) {
  const canvas = yandex.heatCanvas, map = yandex.map;
  if (!canvas || !map) return;
  if (!heatVisible || !heatPoints.length) { canvas.style.display = "none"; canvas.style.transform = ""; yandexHeatAnchor = null; return; }
  canvas.style.display = "block";
  canvas.style.opacity = yandexHeatZoomHold ? "0" : String(yandexHeatSettings.opacity);
  const container = $("#yandex-map") as HTMLElement, dpr = window.devicePixelRatio || 1;
  const width = container.clientWidth + yandexHeatMargin * 2, height = container.clientHeight + yandexHeatMargin * 2;
  canvas.style.left = `${-yandexHeatMargin}px`; canvas.style.top = `${-yandexHeatMargin}px`;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  const ctx = yandex.heatCtx!;
  const projection = map.options.get("projection"), zoom = map.getZoom();
  const [centerX, centerY] = projection.toGlobalPixels(map.getCenter(), zoom);
  // Экранная координата центра + сдвиг полотна на поле
  const offsetX = container.clientWidth / 2 - centerX + yandexHeatMargin, offsetY = container.clientHeight / 2 - centerY + yandexHeatMargin;
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
  canvas.style.transform = "";
  yandexHeatAnchor = { x: centerX, y: centerY, zoom };
}
let yandexHeatFrame = 0;
function scheduleYandexHeat() {
  if (yandexHeatFrame) return;
  yandexHeatFrame = requestAnimationFrame(() => { yandexHeatFrame = 0; drawYandexHeat(lastRender.heatPoints, lastRender.heatVisible); });
}
// Точки Яндекса как на dtp-stat.ru: не пресеты-иконки, а GeoObject-круги постоянного
// ПИКСЕЛЬНОГО радиуса — geometry Circle с радиусом в метрах (метры-на-пиксель × 5),
// плоская заливка по тяжести без обводки; при смене зума радиус пересчитывается
const yandexPointRadiusPx = 5;
function yandexMetersPerPixel(latitude: number, zoom: number) {
  return (2 * Math.PI * 6378137 * Math.cos((latitude * Math.PI) / 180)) / (256 * Math.pow(2, zoom));
}
// Placemark'и Яндекса — DOM-элементы: на общероссийском зуме ограничиваем выборку,
// иначе карта замирает
const yandexMarkerLimit = 6000;
function updateYandexPointRadius() {
  if (!yandex.map) return;
  const zoom = yandex.map.getZoom();
  yandexMarkers.forEach((entry) => entry.placemark.geometry.setRadius(yandexMetersPerPixel(entry.latitude, zoom) * yandexPointRadiusPx));
}
function renderYandex(allVisible, heatPoints, heatVisible) {
  if (!yandex.map) return;
  const visible = allVisible.length > yandexMarkerLimit ? allVisible.slice(0, yandexMarkerLimit) : allVisible;
  // Placemark'и обновляем диффом, а не пересозданием всех на каждый сдвиг карты
  const alive = new Set(heatVisible ? [] : visible.map((item) => item.id));
  for (const [id, entry] of yandexMarkers) if (!alive.has(id)) { yandex.points.remove(entry.placemark); yandexMarkers.delete(id); }
  if (!heatVisible) for (const item of visible) if (!yandexMarkers.has(item.id)) {
    const placemark = new (window as any).ymaps.GeoObject({
      geometry: { type: "Circle", coordinates: [item.point.longitude, item.point.latitude], radius: yandexMetersPerPixel(item.point.latitude, yandex.map.getZoom()) * yandexPointRadiusPx },
      properties: {},
    }, { fillColor: markerColor(item), outline: false, balloonOffset: [yandexPointRadiusPx - 2, 0] });
    // Балун строим только по клику: на зуме добавляются сотни точек разом
    placemark.events.add("click", (event) => { event.stopPropagation(); yandex.map.balloon.open(event.get("coords"), { content: markerPopup(item) }, { autoPan: false }); syncPopupUrl(item.id, item.point.latitude, item.point.longitude, yandex.map.getZoom()); });
    yandexMarkers.set(item.id, { placemark, latitude: item.point.latitude });
    yandex.points.add(placemark);
  }
  drawYandexHeat(heatPoints, heatVisible);
}
function renderMapbox(visible, heatPoints, heatVisible) {
  const map = mapbox.map;
  // isStyleLoaded() у стиля Standard подолгу остаётся false, поэтому ориентируемся
  // на сами источники: данные можно заливать, как только они созданы
  if (!map || !map.getSource("dtp-heat") || !map.getSource("dtp-points")) return;
  map.getSource("dtp-heat")?.setData({ type:"FeatureCollection", features: heatVisible ? heatFeatures(heatPoints) : [] });
  map.getSource("dtp-points")?.setData({ type:"FeatureCollection", features: heatVisible ? [] : visible.map((item) => ({ type:"Feature", geometry:{ type:"Point", coordinates:[item.point.longitude, item.point.latitude] }, properties:{ severity:item.severity, popup:markerPopup(item), id:item.id } })) });
  const paint = mapboxHeatPaint();
  map.setPaintProperty("dtp-heat", "heatmap-radius", paint.radius); map.setPaintProperty("dtp-heat", "heatmap-intensity", paint.intensity); map.setPaintProperty("dtp-heat", "heatmap-opacity", paint.opacity);
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
  // Коллекция маски «территория под центром» (src/main/geom.ts) — над точками, тепло (canvas z600) всё равно выше
  yandex.mask = new ymaps.GeoObjectCollection(); yandex.map.geoObjects.add(yandex.mask);
  const canvas = document.createElement("canvas");
  canvas.className = "yandex-heat";
  $("#yandex-map").append(canvas);
  yandex.heatCanvas = canvas;
  yandex.heatCtx = canvas.getContext("2d", { willReadFrequently: true });
  renderYandex(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible);
  yandex.map.events.add("boundschange", () => { if (state.mapClient === "yandex") actions.scheduleMapLoad(); });
  // Закрытие балуна (крестик/клик мимо) убирает ?popup= из адреса; при открытии
  // другого ДТП балун сперва закрывается, потом syncPopupUrl пишет новый id
  yandex.map.balloon.events.add("balloonclose", clearPopupUrl);
  // Тепло едет вместе с картой: в жесте полотно догоняет вид transform-сдвигом,
  // перерисовка — по завершении жеста. Живые центр и зум берём из тика события
  // actiontick (публичные tick.globalPixelCenter/tick.zoom): map.getCenter() в ходе
  // жеста отстаёт, а приватные поля action (_zoom, _globalPixelCenter) ненадёжны
  yandex.map.events.add("actiontick", (e: any) => {
    if (state.mapClient !== "yandex") return;
    const anchor = yandexHeatAnchor, canvas = yandex.heatCanvas;
    const tick = e?.originalEvent?.tick;
    if (!anchor || !canvas || canvas.style.display === "none" || !tick?.globalPixelCenter) { actions.applyHeatMode(); return; }
    // Зум-жест (DTP-30): тепло скрывается до конца жеста. Холд не даёт вернуть
    // видимость: если полотно перерисовалось прямо в жесте (якорь перескочил на
    // целевой зум), оставшиеся тики продолжают гасить слой
    if (tick.zoom !== anchor.zoom) { yandexHeatZoomHold = true; canvas.style.opacity = "0"; return; }
    if (yandexHeatZoomHold) { canvas.style.opacity = "0"; return; }
    const [cx, cy] = tick.globalPixelCenter;
    canvas.style.transform = `translate3d(${Math.round(anchor.x - cx)}px, ${Math.round(anchor.y - cy)}px, 0)`;
  });
  yandex.map.events.add("actionend", () => { if (state.mapClient === "yandex") { yandexHeatZoomHold = false; actions.applyHeatMode(); scheduleYandexHeat(); updateYandexPointRadius(); actions.applyRegionMask(); actions.scheduleRegionLookup(); } });
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
  mapbox.map = new mapboxgl.Map({ container:"mapbox-map", style:"mapbox://styles/mapbox/standard", config:{ basemap:{ theme:"monochrome", lightPreset:"day" } }, center:[view.center.longitude, view.center.latitude], zoom:view.zoom });
  // Слои точек и тепла: 'load' у Standard-стиля может не приходить долго, а 'style.load'
  // срабатывает сразу после разбора стиля — создаём источники там (идемпотентно)
  const setup = () => {
    const map = mapbox.map;
    if (!map || map.getSource("dtp-heat")) return;
    map.addSource("dtp-heat", { type:"geojson", data:{ type:"FeatureCollection", features:[] } }); map.addSource("dtp-points", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
    const paint = mapboxHeatPaint();
    map.addLayer({ id:"dtp-heat", type:"heatmap", source:"dtp-heat", paint:{ "heatmap-weight":["get", "weight"], "heatmap-intensity":paint.intensity, "heatmap-radius":paint.radius, "heatmap-opacity":paint.opacity, "heatmap-color":["interpolate", ["linear"], ["heatmap-density"], 0,"rgba(126, 171, 85, 0)", .2,"rgba(126, 171, 85, .6)", .4,"rgba(255, 254, 85, .7)", .6,"rgba(245, 193, 66, .8)", .8,"rgba(223, 130, 68, .9)", 1,"rgba(176, 36, 24, 1)"] } });
    map.addLayer({ id:"dtp-points", type:"circle", source:"dtp-points", paint:{ "circle-radius":5, "circle-color":["match", ["get", "severity"], 4,"#FF001A", 3,"#FF7F24", 1,"#FFB81F", "rgba(24, 51, 74, 0.5)"], "circle-stroke-width":0, "circle-opacity":1 } });
    // Маска «территория под центром» (src/main/geom.ts): источник и слои — над данными; style.load
    // может прийти после applyRegionMask, поэтому в хвосте setup() маска переприсовывается
    if (!map.getSource("region-mask")) {
      map.addSource("region-mask", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
      map.addLayer({ id:"region-mask-fill", type:"fill", source:"region-mask", paint:{ "fill-color":"#AAAAAA", "fill-opacity":.5 } });
      map.addLayer({ id:"region-mask-line", type:"line", source:"region-mask", paint:{ "line-color":"#FFFFFF", "line-opacity":.25, "line-width":1 } });
    }
    map.on("click", "dtp-points", (event) => {
      const feature = event.features[0], popup = new mapboxgl.Popup().setLngLat(feature.geometry.coordinates).setHTML(feature.properties.popup).addTo(map);
      popup.on("close", clearPopupUrl);
      syncPopupUrl(feature.properties.id, feature.geometry.coordinates[1], feature.geometry.coordinates[0], map.getZoom());
    });
    renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible);
    actions.applyRegionMask();
  };
  mapbox.map.on("style.load", setup);
  mapbox.map.on("load", setup);
  mapbox.map.on("moveend", () => { if (state.mapClient === "mapbox") { actions.scheduleMapLoad(); actions.scheduleRegionLookup(); } });
  // На время зум-жеста тепло скрывается (DTP-30), точки остаются видимыми;
  // прозрачность возвращаем по значению слайдера, а не запомненную
  mapbox.map.on("zoomstart", () => { if (state.mapClient !== "mapbox" || mapboxHeatHold || !mapbox.map.getLayer("dtp-heat")) return; mapboxHeatHold = true; mapbox.map.setPaintProperty("dtp-heat", "heatmap-opacity", 0); });
  mapbox.map.on("zoomend", () => { if (state.mapClient !== "mapbox") return; if (mapboxHeatHold) { mapboxHeatHold = false; mapbox.map.setPaintProperty("dtp-heat", "heatmap-opacity", mapboxHeatPaint().opacity); } actions.applyHeatMode(); });
}
function renderMapSwitcher() { document.querySelectorAll("[data-map-client], [data-quick-map]").forEach((button) => button.classList.toggle("active", (button.dataset.mapClient || button.dataset.quickMap) === state.mapClient)); }
async function switchMapClient(client) {
  if (client === state.mapClient) return;
  const view = currentView(); state.mapClient = client; localStorage.setItem("map-client", client); renderMapSwitcher(); renderHeatControls();
  $("#leaflet-map").hidden = client !== "leaflet"; $("#yandex-map").hidden = client !== "yandex"; $("#mapbox-map").hidden = client !== "mapbox";
  if (client === "leaflet") { map.setView([view.center.latitude, view.center.longitude], view.zoom, { animate: false }); map.invalidateSize(); renderLeaflet(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); actions.applyRegionMask(); return; }
  try {
    if (client === "yandex") { await ensureYandex(view); renderYandex(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); actions.applyRegionMask(); }
    else { await ensureMapbox(view); renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); mapbox.map.resize(); actions.applyRegionMask(); }
  } catch { state.mapClient = "leaflet"; localStorage.setItem("map-client", "leaflet"); $("#yandex-map").hidden = true; $("#mapbox-map").hidden = true; $("#leaflet-map").hidden = false; renderMapSwitcher(); renderHeatControls(); setStatus(t("unavailable")); actions.applyRegionMask(); }
}

function renderHeatControls() {
  // Панель ползунков имеет смысл только пока на экране тепловая карта
  $("#heat-controls").hidden = !lastRender.heatVisible;
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

export { map, markers, yandex, mapbox, currentView, heatZoomMax, heatInView, renderLeaflet, renderYandex, renderMapbox, renderMapSwitcher, switchMapClient, renderHeatControls, updateHeatControls };
