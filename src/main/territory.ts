// Территория: границы регионов, regionAtCenter, закрепление региона, поиск

import { $, state, regionIndex, actions } from "./context.js";
import { t } from "./i18n.js";
import { refreshCascade } from "./filters.js";
import { map, yandex, mapbox } from "./maps.js";

const regionShapes = fetch("assets/regions.geojson").then((response) => response.ok ? response.json() : Promise.reject(new Error("Region boundaries unavailable")));
function inRing(point, ring) { let inside = false; for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) { const [x, y] = ring[index], [px, py] = ring[previous]; if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside; } return inside; }
// Фолбэк для бэкенда без LATITUDE/LONGITUDE: регион под центром карты. Центр передаёт
// вызывающий: в Меркаторе середина bounds по широте не совпадает с центром вида и на
// малом зуме уводит точку в соседний регион. Внутренние кольца (дырки) учитываем, из
// содержащих регионов выбираем наименьший — иначе Москва попадёт во внешнее кольцо
// Московской области
async function regionAtCenter(latitude: number, longitude: number) {
  const data = await regionShapes, point = [longitude, latitude];
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
  applyRegionLock();
}
// Закрытый замок блокирует смену региона: поля поиска приглушены, попытка ввода
// показывает подсказку «Сначала открепите территорию» вместо списка (DTP-28)
function applyRegionLock() {
  for (const input of document.querySelectorAll<HTMLInputElement>("#region-search, #advanced-region")) {
    if (state.territory) input.setAttribute("data-locked", ""); else input.removeAttribute("data-locked");
    input.title = state.territory ? t("lockHint") : "";
  }
}
async function selectRegion(region) {
  const data = await regionShapes;
  const feature = (data.features || []).find((item) => Number(item.properties.id) === region.id);
  if (!feature) return;
  state.territory = { id: region.id, name: region.name };
  updateTerritoryCard();
  refreshCascade(); // регион — родитель каскадной секции «Место ДТП»
  $("#region-suggest").hidden = true;
  $("#region-search").value = "";
  // Карта открывается по центру выбранной области (города региона)
  const { west, south, east, north } = featureBounds(feature);
  if (state.mapClient === "yandex" && yandex.map) yandex.map.setBounds([[west, south], [east, north]], { checkZoomRange: true });
  else if (state.mapClient === "mapbox" && mapbox.map) mapbox.map.fitBounds([[west, south], [east, north]], { duration: 0 });
  else map.fitBounds([[south, west], [north, east]], { animate: false });
  actions.loadMapData();
}
function drawRegionSuggest() {
  const input = $("#region-search") as HTMLInputElement, suggest = $("#region-suggest");
  // Замок территории запрещает смену региона — вместо подсказок объясняем почему (DTP-28)
  if (state.territory) {
    suggest.hidden = false;
    suggest.replaceChildren(Object.assign(document.createElement("p"), { className:"region-lock-hint", textContent:t("lockHint") }));
    return;
  }
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

export { regionAtCenter, updateTerritoryCard, selectRegion, drawRegionSuggest };
