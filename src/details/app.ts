const api = "https://dtpstat-api.dexoon.workers.dev/api/upstream";
const root = document.querySelector("#detail") as HTMLElement;
const query = new URLSearchParams(location.search), id = query.get("id") || "", year = query.get("year") || "", regionSlug = query.get("region") || "", language = query.get("lang") === "en" ? "en" : localStorage.getItem("language") === "en" ? "en" : "ru";
const text = language === "en" ? { title:"Accident details", missing:"Accident was not found.", back:"Show accident nearby", users:"Road users", injured:"Injured", dead:"Deaths", usersTitle:"Road users", official:"Official traffic police data", address:"Address unknown", map:"Map", panorama:"Panorama", road:"Road conditions", weather:"Weather", nearby:"Nearby objects", violations:"Traffic violations", facts:"Accident details", type:"Type", severity:"Severity", region:"Region", coordinates:"Coordinates", light:"No injuries", serious:"Injured", fatal:"Fatal", unavailable:"No data" } : { title:"Подробности ДТП", missing:"ДТП не найдено.", back:"Показать ДТП рядом", users:"Участники", injured:"Пострадали", dead:"Погибли", usersTitle:"Участники ДТП", official:"Официальные данные ГИБДД", address:"Адрес неизвестен", map:"Карта", panorama:"Панорама", road:"Состояние дороги", weather:"Погода", nearby:"Объекты рядом", violations:"Нарушения ПДД", facts:"Свойства ДТП", type:"Вид ДТП", severity:"Тяжесть последствий", region:"Регион", coordinates:"Координаты", light:"Без пострадавших", serious:"С пострадавшими", fatal:"С погибшими", unavailable:"Нет данных" };
const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" } as Record<string, string>)[character]);
const formatDate = (value: string) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", { weekday:"long", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(value));
const section = (title: string, values: string[]) => values.length ? `<section class="detail-section"><h2>${title}</h2><div class="tags">${values.map((value) => `<span class="tag">${escape(value)}</span>`).join("")}</div></section>` : "";
const list = (value: unknown) => Array.isArray(value) ? value.filter(Boolean).map(String) : value ? [String(value)] : [];
const people = (detail: any) => (detail.VEHICLES || []).flatMap((vehicle) => vehicle.PERSONS || []);

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
    map.geoObjects.add(new ymaps.Placemark(point, {}, { preset:"islands#redIcon" }));
    const mapButton = document.querySelector("#show-map") as HTMLButtonElement, panoramaButton = document.querySelector("#show-panorama") as HTMLButtonElement, mapNode = document.querySelector("#detail-map") as HTMLElement, panoramaNode = document.querySelector("#detail-panorama") as HTMLElement;
    mapButton.addEventListener("click", () => { mapNode.hidden = false; panoramaNode.hidden = true; mapButton.classList.add("active"); panoramaButton.classList.remove("active"); map.container.fitToViewport(); });
    ymaps.panorama.createPlayer("detail-panorama", point, { controls:[] }).then(() => { panoramaButton.disabled = false; panoramaButton.addEventListener("click", () => { mapNode.hidden = true; panoramaNode.hidden = false; panoramaButton.classList.add("active"); mapButton.classList.remove("active"); }); }, () => { panoramaNode.remove(); });
  }).catch(() => {
    const map = L.map("detail-map", { zoomControl:true, scrollWheelZoom:false }).setView(point, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap contributors" }).addTo(map); L.marker(point).addTo(map);
  });
}

async function load() {
  if (!/^\d+$/.test(id)) throw new Error("Missing accident reference");
  const dataResponse = await fetch(`${api}/dtp/json?${new URLSearchParams({ EM_NUMBER:id })}`);
  if (!dataResponse.ok) throw new Error("Not found");
  const source = (await dataResponse.json())[0];
  if (!source?.POINT?.coordinates) throw new Error("Not found");
  const detail = { id:source.EM_NUMBER, datetime:source.DATE_TIME, participants:source.PERS_AMOUNT, injured:source.SUFFER_AMOUNT, dead:source.LOST_AMOUNT, point:{ latitude:source.POINT.coordinates[1], longitude:source.POINT.coordinates[0] }, category_name:source.EM_TYPE, address:[source.STREET, source.HOUSE].filter(Boolean).join(", ") || source.ROADS, street:source.ROADS, region_name:list(source.REGIONS).at(-1), severity:source.LOST_AMOUNT ? text.fatal : source.SUFFER_AMOUNT ? text.serious : text.light };
  const road = list(source.TRAFFIC_AREA_STATE), weather = list(source.CLOUDS), nearby = [...list(source.RD_CONSTR_HERES), ...list(source.RD_CONSTR_THERES)], violations = people(source).flatMap((person) => [...list(person.MAIN_PDD_DERANGEMENT), ...list(person.ATTENDANT_PDD_DERANGEMENT)]), users = people(source).flatMap((person) => list(person.PART_TYPE)), severity = detail.severity, region = detail.region_name || text.unavailable;
  document.documentElement.lang = language; document.title = `${text.title} — ${detail.category_name || text.title}`; root.className = "";
  root.innerHTML = `<section class="map-stage"><div id="detail-map" class="detail-map" aria-label="${language === "en" ? "Accident location" : "Место ДТП"}"></div><div id="detail-panorama" class="detail-map" hidden aria-label="${text.panorama}"></div><div class="map-tools"><button id="show-map" class="active" type="button">⌖ ${text.map}</button><button id="show-panorama" type="button" disabled>◉ ${text.panorama}</button></div></section><article class="content"><a class="back" href="../?center=${detail.point.latitude}:${detail.point.longitude}&zoom=15">← ${text.back}</a><p class="meta">${escape(formatDate(detail.datetime))} <span>·</span> ${escape(detail.address || detail.street || text.address)}</p><h1>${escape(detail.category_name || text.title)}</h1><div class="stats"><div class="stat"><i></i><span>${text.users}</span><strong>${escape(detail.participants)}</strong></div><div class="stat injured"><i></i><span>${text.injured}</span><strong>${escape(detail.injured)}</strong></div><div class="stat dead"><i></i><span>${text.dead}</span><strong>${escape(detail.dead)}</strong></div></div><section class="detail-section facts"><h2>${text.facts}</h2><dl><div><dt>${text.type}</dt><dd>${escape(detail.category_name || text.unavailable)}</dd></div><div><dt>${text.severity}</dt><dd>${escape(severity)}</dd></div><div><dt>${text.region}</dt><dd>${escape(region)}</dd></div><div><dt>${text.coordinates}</dt><dd>${Number(detail.point.latitude).toFixed(6)}, ${Number(detail.point.longitude).toFixed(6)}</dd></div></dl></section>${section(text.road, road)}${section(text.weather, weather)}${section(text.nearby, nearby)}${section(text.violations, violations)}<section class="detail-section"><h2>${text.usersTitle}</h2><div class="cards">${(users.length ? users : [text.users]).map((user) => `<article class="card"><div class="card-icon">●</div><h3>${escape(user)}</h3><p>${escape(detail.participants)} ${language === "en" ? "people involved" : "чел. участвовало"}</p></article>`).join("")}</div></section><p class="official">⚠ <b>${text.official}</b></p></article>`;
  initMap(detail);
}

load().catch(() => { root.className = "error"; root.textContent = text.missing; });
