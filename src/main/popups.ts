// Точки и попапы: contains/pointItems, палитра, HTML попапа с кэшем

import { state, emTypeNames } from "./context.js";
import { intlFormatter, number } from "./i18n.js";

function contains(bounds, point) { return point.longitude >= bounds.west && point.longitude <= bounds.east && point.latitude >= bounds.south && point.latitude <= bounds.north; }
function pointItems(data) {
  return (data.features || []).map((feature) => {
    const item = feature.properties || {}, [longitude, latitude] = feature.geometry?.coordinates || [];
    // hv_category: 1 — никто не пострадал (в точках API не встречается), 2 — лёгкий, 3 — тяжёлый, 4 — с погибшими
    const severity = item.hv_category === 1 ? 0 : item.hv_category === 2 ? 1 : item.hv_category === 3 ? 3 : item.lost_amount ? 4 : item.suffer_amount ? 3 : 0;
    // Новый бэкенд отдаёт date_time/address/hv_category; попап и диаграмма переживают их отсутствие
    return { id:String(item.em_number), datetime:item.date_time || null, participants:Number(item.pers_amount || 0), injured:Number(item.suffer_amount || 0), dead:Number(item.lost_amount || 0), point:{ latitude, longitude }, severity, category:Number(item.em_type_id), category_name:emTypeNames.get(Number(item.em_type_id)) || (state.language === "ru" ? "ДТП" : "Road accident"), address:item.address, street:item.address, participant_categories:[1] };
  }).filter((item) => Number.isFinite(item.point.latitude) && Number.isFinite(item.point.longitude));
}
// Палитра точек dtp-stat.ru: без пострадавших / лёгкий / тяжёлый / с погибшими
function markerColor(item) { return item.severity === 4 ? "#FF001A" : item.severity === 3 ? "#FF7F24" : item.severity === 1 ? "#FFB81F" : "rgba(24, 51, 74, 0.5)"; }
function pluralPeople(count) {
  const last = count % 10, two = count % 100;
  return last >= 2 && last <= 4 && (two < 10 || two > 20) ? (state.language === "ru" ? "человека" : "people") : (state.language === "ru" ? "человек" : "people");
}
// HTML попапа кэшируется: один и тот же пункт попадает в попап/GeoJSON многократно
let popupCache = new WeakMap<object, string>();
// Origin сайта-родителя во встраивании (запрашивает deeplink.ts, ответ — main.js
// темы): «Подробнее о ДТП» ведёт на /dtp/<id>/ домена сайта через target="_top",
// вне встраивания — на локальную details/, как раньше. Origin приходит
// асинхронно, поэтому кэш сбрасывается, а открытые попапы перелинковываются
let siteOrigin: string | null = null;
function detailsHref(id: string) {
  return siteOrigin ? `${siteOrigin}/dtp/${encodeURIComponent(id)}/` : `details/?id=${encodeURIComponent(id)}&lang=${state.language}`;
}
function setSiteOrigin(origin: string | null) {
  if (siteOrigin === origin) return;
  siteOrigin = origin;
  popupCache = new WeakMap();
  document.querySelectorAll(".marker-popup a[href^='details/']").forEach((anchor: HTMLAnchorElement) => {
    const id = new URL(anchor.href).searchParams.get("id");
    if (!id) return;
    anchor.href = detailsHref(id);
    if (origin) anchor.setAttribute("target", "_top");
  });
}
function markerPopup(item) {
  const cached = popupCache.get(item);
  if (cached) return cached;
  const escape = (value) => String(value || "").replace(/[&<>\"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" })[character]);
  const details = state.language === "en" ? "Accident details" : "Подробнее о ДТП";
  // Даты в точках API нет — строка с датой просто не выводится
  const day = item.datetime ? intlFormatter("day", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date(item.datetime)) + `, ${item.datetime.slice(11, 16)}` : "";
  const injured = item.injured > 0 ? `<p class="popup-injured">${number().format(item.injured)} ${pluralPeople(item.injured)} ${state.language === "ru" ? (item.injured === 1 && item.injured % 100 !== 11 ? "пострадал" : "пострадали") : item.injured === 1 ? "was injured" : "were injured"}</p>` : "";
  const dead = item.dead > 0 ? `<p class="popup-dead">${number().format(item.dead)} ${pluralPeople(item.dead)} ${state.language === "ru" ? (item.dead % 10 === 1 && item.dead % 100 !== 11 ? "погиб" : "погибло") : item.dead === 1 ? "died" : "died"}</p>` : "";
  const html = `<div class="marker-popup"><strong>${escape(item.category_name)}</strong>${day ? `<span>${escape(day)}</span>` : ""}${injured}${dead}<a href="${detailsHref(item.id)}"${siteOrigin ? ' target="_top"' : ""}>${details}</a></div>`;
  popupCache.set(item, html);
  return html;
}

export { contains, pointItems, markerColor, markerPopup, setSiteOrigin };
