// Локально (npm run serve) API доступен по тому же origin: serve.mjs проксирует /api на dtpstat-backend.7190805.xyz
const api = ["localhost", "127.0.0.1"].includes(location.hostname) ? "/api" : "https://dtpstat-backend.7190805.xyz/api";
const root = document.querySelector("#detail") as HTMLElement;
const query = new URLSearchParams(location.search), id = query.get("id") || "", language = query.get("lang") === "en" ? "en" : localStorage.getItem("language") === "en" ? "en" : "ru";
// Страница деталей живёт и во встраивании (WP-сайт: кросс-доменный iframe) —
// там адресную строку обновляет страница-родитель, дублируем ей открытое ДТП
if (id && window.parent !== window) { try { window.parent.postMessage({ source: "dtpstat-map", popup: id }, "*"); } catch {} }
// Во встраивании «Показать ДТП рядом» должен вести на главную сайта-родителя,
// а не на pages.dev — спрашиваем у родителя его origin один раз. Нет ответа за
// 1.5 c (стороннее встраивание) — остаёмся на относительной ссылке. Origin
// принимаем только вида scheme://host[:port] — он попадает в href как есть
let siteOrigin: string | null = null;
const parentOrigin = new Promise<string | null>((resolve) => {
  if (window.parent === window) { resolve(null); return; }
  const token = Math.random().toString(36).slice(2);
  const timer = setTimeout(() => { window.removeEventListener("message", onReply); resolve(null); }, 1500);
  const onReply = (event: MessageEvent) => {
    const data = event.data;
    if (data && data.source === "dtpstat-site" && data.token === token) {
      clearTimeout(timer);
      window.removeEventListener("message", onReply);
      resolve(typeof data.origin === "string" && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(data.origin) ? data.origin : null);
    }
  };
  window.addEventListener("message", onReply);
  try { window.parent.postMessage({ source: "dtpstat-map", ask: "origin", token }, "*"); } catch { resolve(null); }
});
const nearbyHref = (point: { latitude: number; longitude: number }) => `${siteOrigin ? siteOrigin + "/" : "../"}?center=${point.latitude}:${point.longitude}&zoom=15`;
parentOrigin.then((origin) => {
  siteOrigin = origin;
  const pill = document.querySelector(".pill") as HTMLAnchorElement | null;
  // карточка ещё не отрисована (pill.search пуст) — ссылку соберёт load()
  if (origin && pill && pill.search) pill.href = origin + "/" + pill.search;
});
const text = language === "en" ? { title:"Accident details", missing:"Accident was not found.", nearby:"Show accident nearby", map:"Map", panorama:"Panorama", transport:"Vehicles", users:"Road users", injured:"Injured", dead:"Deaths", official:"Official traffic police data", address:"Address unknown", scheme:"Crash scheme", noViolations:"No violations", violations:"Traffic violations" } : { title:"Подробности ДТП", missing:"ДТП не найдено.", nearby:"Показать ДТП рядом", map:"Карта", panorama:"Панорама", transport:"Транспорт", users:"Участники", injured:"Пострадали", dead:"Погибли", official:"Официальные данные ГИБДД", address:"Адрес неизвестен", scheme:"Схема ДТП", noViolations:"Нет нарушений", violations:"Нарушения ПДД" };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" } as Record<string, string>)[character]);
const list = (value: unknown) => Array.isArray(value) ? value.filter(Boolean).map(String) : value ? [String(value)] : [];
const objects = (value: unknown) => Array.isArray(value) ? value : value ? [value] : [];
const formatDate = (value: string) => {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", { weekday:"long" }).format(date);
  const day = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", { day:"2-digit", month:"2-digit", year:"numeric" }).format(date);
  return `${weekday}, ${day} ${language === "en" ? "at" : "в"} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const personIcon = (partType: string) => /пешеход/i.test(partType) ? "pedestrian" : /велосипед/i.test(partType) ? "cyclist" : /пассажир/i.test(partType) ? "passenger" : "driver";
// «Скончался…» — тоже погибший (в данных ГИБДД встречаются обе формулировки)
const hvTone = (value: string) => /^не пострадал/i.test(value) ? "ok" : /погиб|скончал/i.test(value) ? "dead" : /ранен|пострада|травм/i.test(value) ? "injured" : "ok";
// SCHEMA_ID нового API — pk справочника /api/dict/schemas, имя — код схемы ГИБДД.
// Картинки схем лежат локально (assets/scheme/<код>.png); у восьми кодов (x90)
// картинки в репозитории старого сайта не было — карточка скроется по onerror
const SCHEMA_MAP: Record<string, string> = { "1":"740", "2":"610", "3":"780", "4":"820", "5":"600", "6":"120", "7":"490", "8":"700", "9":"950", "10":"300", "11":"430", "12":"130", "13":"990", "14":"500", "15":"200", "16":"880", "17":"750", "18":"890", "19":"070", "20":"290", "21":"840", "22":"420", "23":"010", "24":"590", "25":"230", "26":"870", "27":"800", "28":"930", "29":"940", "30":"220", "31":"790", "32":"210", "33":"910", "34":"090", "35":"830", "36":"920", "37":"330", "38":"410", "39":"400", "40":"860", "41":"960", "42":"190", "43":"690", "44":"730", "45":"810", "46":"140", "47":"040", "48":"030", "49":"340", "50":"630", "51":"060", "52":"710", "53":"720", "54":"110", "55":"850", "56":"050", "57":"390", "58":"020", "59":"760", "60":"620", "61":"770", "62":"980", "63":"440", "64":"900", "65":"970", "66":"100", "67":"310", "68":"320" };
const schemeImage = (schema: number) => { const code = SCHEMA_MAP[String(schema)]; return code ? `../assets/scheme/${code}.png` : ""; };
// Карточка участника в стиле старого сайта: иконка роли в «квадряке», состояние
// в светлой плашке (у погибших/пострадавших — красная/жёлтая), нарушения с иконкой
const personCard = (person: any) => {
  const violations = [...list(person.MAIN_PDD_DERANGEMENT), ...list(person.ATTENDANT_PDD_DERANGEMENT)].filter((value, index, all) => all.indexOf(value) === index);
  const role = [person.SEX, person.DRIVER_SERVICE_LENGTH != null ? `${language === "en" ? "experience" : "стаж"} ${person.DRIVER_SERVICE_LENGTH}` : ""].filter(Boolean).join(", ");
  const tone = person.HV_TYPE ? hvTone(String(person.HV_TYPE)) : "ok";
  return `<article class="person ${tone}"><div class="person-head"><span class="person-icon"><img src="../assets/icons/person/${personIcon(String(person.PART_TYPE || ""))}.svg" alt=""></span><div><h4>${escape(person.PART_TYPE || text.users)}</h4><p>${escape(role)}</p></div></div><p class="person-state">${escape(person.HV_TYPE || (language === "en" ? "condition unknown" : "состояние неизвестно"))}</p>${violations.length ? `<ul class="violations">${violations.map((value) => `<li>${escape(value)}</li>`).join("")}</ul>` : ""}</article>`;
};

function loadYandex() {
  return new Promise<any>((resolve, reject) => {
    if ((window as any).ymaps) { (window as any).ymaps.ready(resolve); return; }
    const key = (window as any).YANDEX_MAPS_KEY;
    if (!key) { reject(new Error("Yandex Maps key is missing")); return; }
    const script = document.createElement("script"); script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=${language === "en" ? "en_US" : "ru_RU"}`;
    script.onload = () => (window as any).ymaps.ready(resolve); script.onerror = () => reject(new Error("Yandex Maps unavailable")); document.head.append(script);
  });
}

function initMap(detail: any) {
  const point = [detail.point.latitude, detail.point.longitude];
  loadYandex().then((ymaps) => {
    const map = new ymaps.Map("detail-map", { center:point, zoom:16, controls:["zoomControl"] }, { maxZoom:20, minZoom:1, avoidFractionalZoom:true, yandexMapDisablePoiInteractivity:true, suppressMapOpenBlock:true });
    map.geoObjects.add(new ymaps.Placemark(point, {}, { preset:"islands#redCircleDotIcon" }));
    // У Яндекса «Как добраться» и «Создать свою карту» живут в панели копирайтов —
    // убираем их точечно, оставляя «© Яндекс Условия использования». Кнопки
    // дорисовываются позже карты, поэтому чистим и по мере появления (MutationObserver)
    const copyrights = map.panes.get("copyrights")?.getElement();
    if (copyrights) {
      const clean = () => copyrights.querySelectorAll("a, button").forEach((node) => { if (/добраться|свою карту|constructor/i.test(node.textContent || "")) node.remove(); });
      clean();
      new MutationObserver(clean).observe(copyrights, { childList: true, subtree: true });
    }
    const mapButton = document.querySelector("#show-map") as HTMLButtonElement, panoramaButton = document.querySelector("#show-panorama") as HTMLButtonElement, mapNode = document.querySelector("#detail-map") as HTMLElement, panoramaNode = document.querySelector("#detail-panorama") as HTMLElement;
    mapButton.addEventListener("click", () => { mapNode.hidden = false; panoramaNode.hidden = true; mapButton.classList.add("active"); panoramaButton.classList.remove("active"); map.container.fitToViewport(); });
    ymaps.panorama.createPlayer("detail-panorama", point, { controls:[] }).then(() => { panoramaButton.disabled = false; panoramaButton.addEventListener("click", () => { mapNode.hidden = true; panoramaNode.hidden = false; panoramaButton.classList.add("active"); mapButton.classList.remove("active"); }); }, () => { panoramaNode.remove(); panoramaButton.remove(); });
  }).catch(() => {
    const map = L.map("detail-map", { zoomControl:true, scrollWheelZoom:false }).setView(point, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap contributors" }).addTo(map);
    L.circleMarker(point, { radius:7, weight:0, fillColor:"#FF001A", fillOpacity:1 }).addTo(map);
  });
}

async function load() {
  if (!/^\d+$/.test(id)) throw new Error("Missing accident reference");
  const dataResponse = await fetch(`${api}/dtp/json?${new URLSearchParams({ EM_NUMBER:id })}`);
  if (!dataResponse.ok) throw new Error("Not found");
  const source = (await dataResponse.json())[0];
  if (!source?.POINT?.coordinates) throw new Error("Not found");
  const detail = {
    id:source.EM_NUMBER, datetime:source.DATE_TIME,
    vehiclesCount:Number((source.VEHICLES || []).length), participants:source.PERS_AMOUNT, injured:source.SUFFER_AMOUNT, dead:source.LOST_AMOUNT,
    point:{ latitude:source.POINT.coordinates[1], longitude:source.POINT.coordinates[0] },
    category_name:source.EM_TYPE,
    address:[source.PLACE, source.STREET, source.HOUSE].filter(Boolean).join(", ") || source.ROADS || text.address,
    schema:Number(source.SCHEMA_ID) || 0,
    tags:[...list(source.LIGHT_TYPE), ...list(source.CLOUDS), ...list(source.TRAFFIC_AREA_STATE), ...list(source.MT_RATE)],
    people:objects(source.PERSONS), vehicles:objects(source.VEHICLES),
  };
  document.documentElement.lang = language;
  document.title = `${text.title} — ${detail.category_name || text.title}`;
  root.className = "";
  // Индикаторы старого сайта: иконки media/all|participants|injured|dead.svg,
  // значения «Пострадали»/«Погибли» в фирменных жёлтом/красном
  const counter = (icon: string, label: string, value: any, tone = "") => `<div class="${tone}"><img src="../assets/icons/${icon}.svg" alt=""><span>${label}<strong>${escape(value ?? 0)}</strong></span></div>`;
  // Участники: сначала люди вне транспорта, затем по ТС; карточки переносятся
  // на новые строки
  const groups = `<div class="person-scroll"><div class="person-group">${detail.people.length ? `<div class="person-cards">${detail.people.map(personCard).join("")}</div>` : ""}</div>${detail.vehicles.map((vehicle: any) => {
    const title = [vehicle.MARK, vehicle.COLOR, vehicle.YEAR].filter(Boolean).join(", ");
    return `<div class="person-group">${title ? `<h3>${escape(title)}</h3>` : ""}<div class="person-cards">${objects(vehicle.PERSONS).map(personCard).join("")}</div></div>`;
  }).join("")}</div>`;
  root.innerHTML = `<section class="map-stage"><div id="detail-map" class="detail-map" aria-label="${language === "en" ? "Accident location" : "Место ДТП"}"></div><div id="detail-panorama" class="detail-map" hidden aria-label="${text.panorama}"></div><div class="map-tools"><a class="pill" href="${nearbyHref(detail.point)}" target="_blank" rel="noopener">${text.nearby}</a><span class="pill-group"><button id="show-map" class="active" type="button">${text.map}</button><button id="show-panorama" type="button" disabled>${text.panorama}</button></span></div></section><article class="content"><div class="head-grid${detail.schema ? "" : " no-scheme"}">${detail.schema && schemeImage(detail.schema) ? `<figure class="scheme"><img src="${schemeImage(detail.schema)}" alt="${text.scheme}" onerror="this.closest('figure').remove();document.querySelector('.head-grid').classList.add('no-scheme')"><figcaption>${text.scheme}</figcaption></figure>` : ""}<div class="head"><p class="meta">${escape(formatDate(detail.datetime))} <i>|</i> ${escape(detail.address)}</p><h1>${escape(detail.category_name || text.title)}</h1><div class="counters">${counter("all", text.transport, detail.vehiclesCount)}${counter("participants", text.users, detail.participants)}${counter("injured", text.injured, detail.injured, "injured")}${counter("dead", text.dead, detail.dead, "dead")}</div>${detail.tags.length ? `<div class="chips">${detail.tags.map((tag: string) => `<span>${escape(tag)}</span>`).join("")}</div>` : ""}</div></div><section class="participants"><h2>${text.users}</h2>${groups}</section><p class="official"><a href="https://gibdd.ru" target="_blank" rel="noopener"><img src="https://wp.dtp-stat.ru/wp-content/uploads/2026/09/gibdd-5ee641.svg" alt="">${text.official}</a></p></article>`;
  initMap(detail);
}

load().catch(() => { root.className = "error"; root.textContent = text.missing; });
