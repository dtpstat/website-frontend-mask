// Территория под центром карты: эндпоинт /geom/getRegionUnderPoint (lat, lng, level = OSM
// admin_level) возвращает ОБРАТНЫЙ полигон «мир минус админ-единица» + name. Рисуем его серой
// полупрозрачной маской (как на старом сайте) и показываем name в плашке снизу по центру.
// Чисто информационно: на state.territory, фильтры и загрузку данных не влияет; fetch мимо
// apiFetch, чтобы каждый пан не мигал полоской загрузки. Уровень из зума — маппинг старого
// сайта (0-6 → 2 страна, 7-10 → 4 регион, 11-13 → 6 район, 14+ → 8 город/район города)

import { api, $, state } from "./context.js";
import { map, yandex, mapbox, currentView } from "./maps.js";

// Кэш ответов по ячейкам: размер ячейки в градусах на admin-level (в fetch идут те же
// округлённые координаты, что в ключе). «Россия» (уровень 2) не кэшируем — 3.5МБ геометрии
const regionCell: Record<number, number> = { 2: 2, 4: 0.5, 6: 0.1, 8: 0.02 };
const maskCache = new Map<string, any>();
let maskFeature: any = null, maskName = "", maskLevel = 0, maskKey = "", maskSeq = 0, maskTimer = 0, maskAbort: AbortController | null = null;

function scheduleRegionLookup(delay = 250) { clearTimeout(maskTimer); maskTimer = setTimeout(lookupRegion, delay); }

async function lookupRegion() {
  const view = currentView();
  const level = view.zoom <= 6 ? 2 : view.zoom <= 10 ? 4 : view.zoom <= 13 ? 6 : 8;
  const cell = regionCell[level];
  const lat = (Math.round(view.center.latitude / cell) * cell).toFixed(3), lng = (Math.round(view.center.longitude / cell) * cell).toFixed(3);
  const key = `${level}|${lat}|${lng}`;
  if (key === maskKey) return;
  maskKey = key;
  const cached = maskCache.get(key);
  if (cached) { applyRegion(cached, level); return; }
  const loadId = ++maskSeq;
  maskAbort?.abort(); maskAbort = new AbortController();
  try {
    const response = await fetch(`${api}/geom/getRegionUnderPoint?lat=${lat}&lng=${lng}&level=${level}`, { signal: maskAbort.signal });
    if (!response.ok) throw new Error("region lookup failed");
    const found = await response.json();
    if (loadId !== maskSeq) return;
    if (level !== 2) { if (maskCache.size >= 40) maskCache.delete(maskCache.keys().next().value); maskCache.set(key, found); }
    applyRegion(found, level);
  } catch (error) {
    if (loadId === maskSeq && (error as Error).name !== "AbortError") maskKey = ""; // сбой — маску не трогаем, повторим на следующем ходе
  }
}

function applyRegion(feature, level) {
  const name = String(feature?.properties?.name || "");
  if (!name) return hideRegionMask(); // центр вне России: name пустой, geometry {}
  if (name === maskName && level === maskLevel) return; // та же территория — геометрию не переприсовываем
  maskFeature = feature; maskName = name; maskLevel = level;
  ($("#region-plate") as HTMLElement).textContent = name;
  ($("#region-plate") as HTMLElement).hidden = false;
  renderMask(thinGeometry(feature.geometry));
}
function hideRegionMask() {
  maskFeature = null; maskName = ""; maskLevel = 0;
  ($("#region-plate") as HTMLElement).hidden = true;
  renderMask(null);
}
// Переприсовка текущей маски активному клиенту (смена клиента, пересборка mapbox-стиля)
function applyRegionMask() { renderMask(maskFeature ? thinGeometry(maskFeature.geometry) : null); }

// Прореживание: «мир минус Россия» — ~180k вершин, для канваса/SVG достаточно 25k
const maskVertexLimit = 25000;
function thinGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates || [];
  let total = 0;
  for (const polygon of polygons) for (const ring of polygon) total += ring.length;
  const stride = Math.max(1, Math.ceil(total / maskVertexLimit));
  if (stride === 1) return geometry;
  const thin = (ring) => ring.filter((point, index) => index % stride === 0 || index === ring.length - 1);
  const coords = polygons.map((polygon) => polygon.map(thin));
  return { type: geometry.type, coordinates: geometry.type === "Polygon" ? coords[0] : coords };
}

function renderMask(geometry) {
  if (state.mapClient === "yandex") renderYandexMask(geometry);
  else if (state.mapClient === "mapbox") renderMapboxMask(geometry);
  else renderLeafletMask(geometry);
}

let leafletMask: any = null;
function renderLeafletMask(geometry) {
  if (leafletMask) { map.removeLayer(leafletMask); leafletMask = null; }
  if (!geometry?.coordinates?.length) return;
  leafletMask = L.geoJSON({ type: "Feature", geometry }, { interactive: false, smoothFactor: 1.5, style: () => ({ color: "#FFFFFF", weight: 1, opacity: .25, fillColor: "#AAAAAA", fillOpacity: .5 }) }).addTo(map);
}

// Кольца региона из обратной геометрии: первый контур каждого полигона — мировое кольцо
function regionRings(geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.coordinates || [];
  return polygons.flatMap((rings) => rings.slice(1));
}
// Яндекс не переваривает мировое кольцо обратной геометрии (широта ±90 вне проекции 3395 —
// полигон вырождается, серым заливается сам регион вместо мира вокруг). Вместо него рамка
// видимой области с полуторным запасом — серое всё, что видно, кроме колец региона; на каждый
// ход карты маска переприсовывается (applyRegionMask), чтобы рамка не отставала от жеста
function renderYandexMask(geometry) {
  if (!yandex.map) return;
  if (yandex.mask) { yandex.map.geoObjects.remove(yandex.mask); yandex.mask = null; }
  const rings = regionRings(geometry);
  if (!rings.length) return;
  const { bounds } = currentView(), dx = (bounds.east - bounds.west) * 1.5, dy = (bounds.north - bounds.south) * 1.5;
  const clamp = (value: number) => Math.max(-85, Math.min(85, value));
  const rect = [[bounds.west - dx, clamp(bounds.south - dy)], [bounds.east + dx, clamp(bounds.south - dy)], [bounds.east + dx, clamp(bounds.north + dy)], [bounds.west - dx, clamp(bounds.north + dy)], [bounds.west - dx, clamp(bounds.south - dy)]];
  yandex.mask = new (window as any).ymaps.GeoObject({ geometry: { type: "Polygon", coordinates: [rect, ...rings] }, properties: {} }, { fillColor: "#AAAAAA", fillOpacity: .5, strokeColor: "#FFFFFF", strokeOpacity: .25, strokeWidth: 1, interactive: false });
  yandex.map.geoObjects.add(yandex.mask);
}

function renderMapboxMask(geometry) {
  const source = mapbox.map?.getSource?.("region-mask");
  if (!source) return; // стиль ещё не собран — setup() применит маску сам через applyRegionMask
  source.setData({ type: "FeatureCollection", features: geometry?.coordinates?.length ? [{ type: "Feature", geometry, properties: {} }] : [] });
}

export { scheduleRegionLookup, applyRegionMask };
