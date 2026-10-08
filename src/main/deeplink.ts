// Deep-link попапа: ?popup= в адресной строке и postMessage родителю-iframe

import { state, lastRender, mapQuery } from "./context.js";
import { map, markers, yandex, mapbox, currentView, heatZoomMax } from "./maps.js";
import { markerPopup } from "./popups.js";

// Открытый попап ДТП отражается в адресной строке: ?popup=<em_number> плюс центр
// и зум на момент открытия — по такой ссылке карта откроется в том же месте.
// Закрытие попапа параметр убирает. replaceState, а не pushState: клики по точкам
// не должны засорять историю браузера
function syncPopupUrl(id, latitude: number, longitude: number, zoom: number) {
  const zoomValue = Math.round(zoom * 10) / 10;
  const query = new URLSearchParams(location.search);
  query.set("popup", String(id));
  query.set("center", `${latitude}:${longitude}`);
  query.set("zoom", String(zoomValue));
  history.replaceState(null, "", `?${query}`);
  postPopupToParent(String(id), `${latitude}:${longitude}`, zoomValue);
}
function clearPopupUrl() {
  const query = new URLSearchParams(location.search);
  if (!query.has("popup")) return;
  query.delete("popup");
  history.replaceState(null, "", query.size ? `?${query}` : location.pathname);
  postPopupToParent(null);
}
// Карта живёт и во встраивании (WP-сайт: кросс-доменный iframe) — там адресную
// строку обновляет страница-родитель, для чего дублируем ей открытие/закрытие
function postPopupToParent(popup: string | null, center?: string, zoom?: number) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ source: "dtpstat-map", popup, center, zoom }, "*"); } catch {}
}
// Прямая ссылка на конкретное ДТП открывает его попап (?popup=<em_number>).
// Единожды: при первом рендере, где точка уже загружена — иначе попап
// пересоздавался бы на каждый сдвиг карты
let linkedPopupPending = Boolean(mapQuery.get("popup"));
function openLinkedPopup() {
  const popupId = mapQuery.get("popup");
  if (!popupId) return true;
  if (state.mapClient === "leaflet") {
    const marker = markers.get(popupId);
    if (marker) { marker.openPopup(); return true; }
    // Маркеров на отдалении нет (точки прячет тепло) — открываем попап по координатам
    // записи, иначе deep-link ?popup= молча не срабатывал до входа в зум точек
    const item = lastRender.visible.find((candidate) => candidate.id === popupId) || state.rawItems.find((candidate) => candidate.id === popupId);
    if (!item) return false;
    map.openPopup(L.popup().setLatLng([item.point.latitude, item.point.longitude]).setContent(markerPopup(item)));
    return true;
  }
  // Точка может быть загружена, но вне экрана (линк без center/zoom) — подводим
  // камеру, иначе балун/попап открылся бы за пределами видимости
  const item = lastRender.visible.find((candidate) => candidate.id === popupId) || state.rawItems.find((candidate) => candidate.id === popupId);
  if (!item) return false;
  const zoom = Math.max(currentView().zoom, heatZoomMax);
  if (state.mapClient === "yandex" && yandex.map) {
    yandex.map.setCenter([item.point.longitude, item.point.latitude], zoom);
    yandex.map.balloon.open([item.point.longitude, item.point.latitude], { content: markerPopup(item) }, { autoPan: false });
    syncPopupUrl(item.id, item.point.latitude, item.point.longitude, yandex.map.getZoom());
    return true;
  }
  if (state.mapClient === "mapbox" && mapbox.map && (window as any).mapboxgl) {
    mapbox.map.jumpTo({ center: [item.point.longitude, item.point.latitude], zoom });
    // focusAfterOpen: false — как в maps.ts: авт-фокус рисует рамку на кнопке
    const popup = new (window as any).mapboxgl.Popup({ focusAfterOpen: false }).setLngLat([item.point.longitude, item.point.latitude]).setHTML(markerPopup(item)).addTo(mapbox.map);
    popup.on("close", clearPopupUrl);
    syncPopupUrl(item.id, item.point.latitude, item.point.longitude, mapbox.map.getZoom());
    return true;
  }
  return false;
}

// Попап из ?popup= открывается на первом рендере, где точка уже загружена: флаг ставит
// pipeline (см. renderMapData), сама попытка — ровно одна
function consumeLinkedPopup() {
  if (!linkedPopupPending) return;
  linkedPopupPending = !openLinkedPopup();
}

export { syncPopupUrl, clearPopupUrl, consumeLinkedPopup };
