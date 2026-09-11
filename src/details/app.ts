// Локально (npm run serve) API доступен по тому же origin: serve.mjs проксирует /api на vpn.kulikow.ru:3000
const api = ["localhost", "127.0.0.1"].includes(location.hostname) ? "/api" : "https://vpn.kulikow.ru:3000/api";
const root = document.querySelector("#detail") as HTMLElement;
const query = new URLSearchParams(location.search), id = query.get("id") || "", language = query.get("lang") === "en" ? "en" : localStorage.getItem("language") === "en" ? "en" : "ru";
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
const personIcon = (partType: string) => /пешеход/i.test(partType) ? "pedestrian" : /велосипед/i.test(partType) ? "cyclist" : "driver";
const hvTone = (value: string) => /^не пострадал/i.test(value) ? "ok" : /погиб/i.test(value) ? "dead" : /ранен|пострада|травм/i.test(value) ? "injured" : "ok";
const personCard = (person: any) => {
  const violations = [...list(person.MAIN_PDD_DERANGEMENT), ...list(person.ATTENDANT_PDD_DERANGEMENT)].filter((value, index, all) => all.indexOf(value) === index);
  const role = [person.PART_TYPE, person.SEX].filter(Boolean).join(", ") + (person.DRIVER_SERVICE_LENGTH != null ? `, ${language === "en" ? "experience" : "стаж"} ${person.DRIVER_SERVICE_LENGTH}` : "");
  return `<article class="person"><div class="person-head"><img src="../assets/icons/${personIcon(String(person.PART_TYPE || ""))}.svg" alt=""><div><h4>${escape(person.PART_TYPE || text.users)}</h4><p>${escape(role)}</p></div></div>${person.HV_TYPE ? `<p class="hv ${hvTone(String(person.HV_TYPE))}">${escape(person.HV_TYPE)}</p>` : ""}${violations.length ? `<ul class="violations">${violations.map((value) => `<li class="${/нет нарушений/i.test(value) ? "" : "bad"}"><i>!</i>${escape(value)}</li>`).join("")}</ul>` : ""}</article>`;
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
  const counter = (icon: string, label: string, value: any, tone = "") => `<div class="${tone}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${icon}</svg><span>${label}</span><strong>${escape(value ?? 0)}</strong></div>`;
  const carIcon = '<path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16"/><rect x="4" y="15" width="16" height="4.5" rx="1.2"/><path d="M7 19.5v1.5M17 19.5v1.5"/>';
  const personIconSvg = '<circle cx="12" cy="7.5" r="3"/><path d="M6 20v-1.5a6 6 0 0 1 12 0V20"/>';
  const groups = `<div class="person-group">${detail.people.length ? `<div class="person-cards">${detail.people.map(personCard).join("")}</div>` : ""}</div>${detail.vehicles.map((vehicle: any) => {
    const title = [vehicle.MARK, vehicle.COLOR, vehicle.YEAR].filter(Boolean).join(", ");
    return `<div class="person-group">${title ? `<h3>${escape(title)}</h3>` : ""}<div class="person-cards">${objects(vehicle.PERSONS).map(personCard).join("")}</div></div>`;
  }).join("")}`;
  root.innerHTML = `<section class="map-stage"><div id="detail-map" class="detail-map" aria-label="${language === "en" ? "Accident location" : "Место ДТП"}"></div><div id="detail-panorama" class="detail-map" hidden aria-label="${text.panorama}"></div><div class="map-tools"><a class="pill" href="../?center=${detail.point.latitude}:${detail.point.longitude}&zoom=15">${text.nearby}</a><span class="pill-group"><button id="show-map" class="active" type="button">${text.map}</button><button id="show-panorama" type="button" disabled>${text.panorama}</button></span></div></section><article class="content"><div class="head-grid${detail.schema ? "" : " no-scheme"}">${detail.schema ? `<figure class="scheme"><img src="https://dtp-stat.ru/static/scheme/${detail.schema}.png" alt="${text.scheme}" onerror="this.closest('figure').remove();document.querySelector('.head-grid').classList.add('no-scheme')"><figcaption>${text.scheme}</figcaption></figure>` : ""}<div class="head"><p class="meta">${escape(formatDate(detail.datetime))} <i>|</i> ${escape(detail.address)}</p><h1>${escape(detail.category_name || text.title)}</h1><div class="counters">${counter(carIcon, text.transport, detail.vehiclesCount)}${counter(personIconSvg, text.users, detail.participants)}${counter(personIconSvg, text.injured, detail.injured, "injured")}${counter(personIconSvg, text.dead, detail.dead, "dead")}</div>${detail.tags.length ? `<div class="chips">${detail.tags.map((tag: string) => `<span>${escape(tag)}</span>`).join("")}</div>` : ""}</div></div><section class="participants"><h2>${text.users}</h2>${groups}</section><p class="official"><span><i></i>${text.official}</span></p></article>`;
  initMap(detail);
}

load().catch(() => { root.className = "error"; root.textContent = text.missing; });
