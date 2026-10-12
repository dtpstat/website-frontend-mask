// Origin API задаётся в .env (API_ORIGIN попадает в dist/maps-config.js); пусто/не задан —
// /api того же origin: локально его проксирует serve.mjs, на своём домене — nginx (см. README)
const api = ((window as any).API_ORIGIN || "") + "/api";
const $ = (selector) => document.querySelector(selector);
const state = { language: new URLSearchParams(location.search).get("lang") || localStorage.getItem("language") || "ru" };
const copy = {
  ru: { title:"Скачать данные — Карта ДТП", homeAria:"Карта ДТП — главная", navigationAria:"Основная навигация", menuAria:"Открыть меню", blog:"Блог и исследования", statistics:"Статистика", downloads:"Скачать данные", about:"О проекте", support:"Поддержать проект", apiHelp:"Инструкция для API", intro:"Здесь вы можете скачать данные по ДТП, чтобы использовать их в исследованиях и анализировать с помощью своих инструментов. Первоисточник данных — официальный сайт ГИБДД, но эти данные приведены с изменениями (например, корректировки координат).", apiNote:"Загрузка выполняется в браузере запросом к API.", regionalData:"Данные по регионам", annualData:"Аккумулированные данные по годам", searchRegions:"Найти регион", searchYears:"Найти год", nothingFound:"Ничего не найдено", period:"январь 2015 – январь 2026", russia:"Россия", downloading:"Подготавливаем файл…", retry:"Не удалось загрузить файл. Попробуйте ещё раз.", downloaded:"Файл скачан", footerAbout:"Проект посвящен проблеме дорожно-транспортных происшествий в России. Цель проекта — повышение безопасности дорожного движения и снижение смертности в ДТП.", contact:"Связаться:", siteMap:"Карта сайта:", license:"Использование материалов возможно с указанием активной ссылки на сайт." },
  en: { title:"Download data — Road accident map", homeAria:"Road accident map — home", navigationAria:"Main navigation", menuAria:"Open menu", blog:"Blog and research", statistics:"Statistics", downloads:"Download data", about:"About the project", support:"Support the project", apiHelp:"API instructions", intro:"Here you can download road accident data for research and analysis with your own tools. The primary source is the official traffic police website; this data includes corrections such as adjusted coordinates.", apiNote:"The file is prepared in the browser with an API request.", regionalData:"Regional data", annualData:"Accumulated data by year", searchRegions:"Find a region", searchYears:"Find a year", nothingFound:"Nothing found", period:"January 2015 – January 2026", russia:"Russia", downloading:"Preparing file…", retry:"Could not load the file. Please try again.", downloaded:"File downloaded", footerAbout:"The project is dedicated to road traffic safety in Russia. Its goal is to improve road safety and reduce deaths in road accidents.", contact:"Contact:", siteMap:"Site map:", license:"Materials may be used with an active link to the website." },
};
const regions = [
  { ru:"Алтайский край", en:"Altai Krai", slug:"altaiskii-krai", size:"2.63 MB" },
  { ru:"Амурская область", en:"Amur Oblast", slug:"amurskaia-oblast", size:"1.53 MB" },
  { ru:"Архангельская область", en:"Arkhangelsk Oblast", slug:"arkhangelskaia-oblast", size:"0.60 MB" },
  { ru:"Астраханская область", en:"Astrakhan Oblast", slug:"astrakhanskaia-oblast", size:"1.99 MB" },
  { ru:"Белгородская область", en:"Belgorod Oblast", slug:"belgorodskaia-oblast", size:"0.98 MB" },
  { ru:"Брянская область", en:"Bryansk Oblast", slug:"brianskaia-oblast", size:"2.28 MB" },
];
const years = [
  { year:"2015–2026", requestYear:"2026", size:"118 MB (5.9 GB)", all:true },
  { year:"2026", size:"660 KB (27 MB)" }, { year:"2025", size:"9.7 MB (451 MB)" },
  { year:"2024", size:"9.8 MB (455 MB)" }, { year:"2023", size:"9.9 MB (459 MB)" }, { year:"2022", size:"9.5 MB (441 MB)" },
];
const t = (key) => copy[state.language][key];

function button(item, kind) {
  const node = document.createElement("button");
  node.className = "download"; node.type = "button";
  node.textContent = kind === "region" ? `.geojson (${item.size})` : ".json.7z";
  if (kind === "year") { node.disabled = true; node.title = state.language === "ru" ? "Архив по всей России не предоставляется текущим API" : "The current API does not provide a Russia-wide archive"; return node; }
  node.addEventListener("click", () => download(node, item, kind));
  return node;
}
function render(list, kind, query = "") {
  const root = $(`#${kind}-rows`); const empty = $(`#${kind}-empty`); const value = query.trim().toLocaleLowerCase();
  const matched = list.filter((item) => (kind === "regional" ? `${item.ru} ${item.en}` : item.year).toLocaleLowerCase().includes(value));
  root.classList.toggle("is-searching", Boolean(value)); root.replaceChildren(...matched.map((item) => {
    const row = document.createElement("article"); row.className = `data-row ${kind === "regional" ? "regional" : "year"}`;
    const name = document.createElement("div"); name.className = "region-name"; name.textContent = kind === "regional" ? item[state.language] : t("russia");
    const period = document.createElement("div"); period.className = "period"; period.textContent = kind === "regional" ? t("period") : item.year;
    const size = document.createElement("div"); size.className = "size"; size.textContent = kind === "regional" ? "" : item.size;
    row.append(name, period, size, button(item, kind === "regional" ? "region" : "year")); return row;
  }));
  empty.hidden = matched.length > 0;
}
function asGeoJson(data) {
  if (!Array.isArray(data)) return data;
  return { type:"FeatureCollection", features:data.map((item) => ({ type:"Feature", geometry:{ type:"Point", coordinates:[item.point?.longitude ?? item.point?.long, item.point?.latitude ?? item.point?.lat] }, properties:item })) };
}
async function download(buttonNode, item, kind) {
  buttonNode.disabled = true; const original = buttonNode.textContent; buttonNode.textContent = t("downloading");
  const year = kind === "region" ? "2026" : (item.requestYear || item.year); const region = kind === "region" ? item.slug : "russia";
  try {
    const regionsResponse = await fetch(`${api}/dict/regions?${new URLSearchParams({ name:item.ru })}`);
    if (!regionsResponse.ok) throw new Error("Regions unavailable");
    const regionRecord = (await regionsResponse.json()).find((value) => value.name === item.ru);
    if (!regionRecord) throw new Error("Region not found");
    // REGION_IDS бэкенд отвергает (валидатор требует REGION), регион один — передаём как скаляр
    const response = await fetch(`${api}/dtp/geojson?${new URLSearchParams({ REGION:String(regionRecord.id), DATE_TIME_FROM:`${year}-01-01T00:00:00`, DATE_TIME_TO:`${year}-12-31T23:59:59` })}`);
    if (!response.ok) throw new Error("API response");
    const body = await response.json(); const output = kind === "region" ? asGeoJson(body) : body;
    const blob = new Blob([JSON.stringify(output)], { type: kind === "region" ? "application/geo+json" : "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${region}-${year}.${kind === "region" ? "geojson" : "json"}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
    buttonNode.textContent = t("downloaded");
  } catch { buttonNode.textContent = t("retry"); }
  finally { setTimeout(() => { buttonNode.disabled = false; buttonNode.textContent = original; }, 1800); }
}
function applyLanguage() {
  document.documentElement.lang = state.language; document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  render(regions, "regional", $("#region-search").value); render(years, "year", $("#year-search").value);
}
$("#region-search").addEventListener("input", (event) => render(regions, "regional", event.target.value));
$("#year-search").addEventListener("input", (event) => render(years, "year", event.target.value));
$("#api-help").addEventListener("click", () => { const panel = $("#api-panel"); panel.hidden = !panel.hidden; $("#api-help").setAttribute("aria-expanded", String(!panel.hidden)); });
applyLanguage();
