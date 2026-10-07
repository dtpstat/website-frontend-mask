// Фильтры: метаданные секций, каскадные словари, про-панель, passesFilters/serverQuery

import { $, state, api, apiFetch, actions, regionIndex } from "./context.js";
import { t } from "./i18n.js";
import { period } from "./dates.js";
import { participantConfig, renderAdvancedControls, selectedParticipants, participantEmTypes, participantProdTypeIds } from "./participants.js";
import { selectRegion, updateTerritoryCard, syncRegionFields } from "./territory.js";

// Секции проф-фильтра, которые уходят параметрами на сервер в /dtp/points.
// Серверные секции проф-фильтра уходят параметрами `${name}_IDS` в /dtp/points.
// 2026-09-26: бэкенд поддержал все kind 'array' (скалярные *_IDS-колонки в DTP_VIEW)
// и 'arrays' по агрегатам persons/vehicles — секции включены, live-проверено на :3100.
const serverSections = ["CLOUD", "DEFECT", "MOTION_INFLUENCE", "RD_CONSTR_HERE", "RD_CONSTR_THERE", "LIGHT_TYPE", "TRAFFIC_AREA_STATE", "MT_RATE", "PART_TYPE", "SAFETY_BELT", "SEX", "HV_TYPE", "MAIN_PDD_DERANGEMENT", "ATTENDANT_PDD_DERANGEMENT", "V_ESCAPE", "P_ESCAPE", "CHILD_SAFETY_TYPE", "DAMAGE_DISPOSITION", "TECH_FAILURE_TYPE", "PLACE", "ROAD", "STREET", "NP", "MARK", "MODEL", "masks"];
const serverSectionLabels: Record<string, string> = { EM_TYPE:"accidentTypes", CLOUD:"weather", DEFECT:"roadDefects", MOTION_INFLUENCE:"roadFactors", RD_CONSTR_HERE:"roadConditions", RD_CONSTR_THERE:"roadConditionsNear", LIGHT_TYPE:"lighting", TRAFFIC_AREA_STATE:"roadSurface", MT_RATE:"movementChange", PART_TYPE:"participantType", SAFETY_BELT:"seatBelt", SEX:"sex", HV_TYPE:"harmSeverity", MAIN_PDD_DERANGEMENT:"ruleViolations", ATTENDANT_PDD_DERANGEMENT:"attendantViolations", V_ESCAPE:"vehicleEscape", P_ESCAPE:"participantEscape", CHILD_SAFETY_TYPE:"childRestraint", DAMAGE_DISPOSITION:"damageDisposition", TECH_FAILURE_TYPE:"techFailure", PLACE:"places", ROAD:"roads", STREET:"streets", NP:"nps", MARK:"marks", MODEL:"models" };
// Каскадные секции: словарь тянется с сервера только при выбранном родителе
// (у улиц/дорог/НП сотни тысяч записей — сразу не грузим). PLACE живёт под регионом.
const sectionParents: Record<string, string> = { PLACE:"REGION", ROAD:"PLACE", STREET:"PLACE", NP:"PLACE", MODEL:"MARK" };
// Значение параметра-маски — сама битовая маска столбца: ADDITIONAL_ATTR (SIM=4, камеры=8, наркотики=1, отказ=2), CHILDREN_ATTR (3/7/71/135)
const maskFeatures = [
  { value:4, param:"SIM", preview:"ДТП с СИМ" },
  { value:8, param:"IN_AREA_OF_CAMERAS", preview:"В зоне камер" },
  { value:1, param:"DRUGS", preview:"Наркотическое опьянение" },
  { value:2, param:"REFUSAL_EXAMINED", preview:"Отказ от освидетельствования" },
  { value:3, param:"UNDER_16", preview:"С детьми до 16 лет" },
  { value:7, param:"UNDER_16_PASSENGER", preview:"Дети до 16, пассажиры" },
  { value:71, param:"UNDER_16_PASSENGER_ORG_MOVED", preview:"Дети до 16, организованная перевозка" },
  { value:135, param:"UNDER_16_PASSENGER_VIOLATION_RULES", preview:"Дети до 16, нарушение правил перевозки" },
];
const intervalFields = [
  { param:"VEH_AMOUNT", preview:"Транспорт", min:0, max:99 },
  { param:"PERS_AMOUNT", preview:"Участники", min:0, max:299 },
  { param:"LOST_AMOUNT", preview:"Погибшие", min:0, max:299 },
  { param:"SUFFER_AMOUNT", preview:"Раненые", min:0, max:299 },
  // Интервалы по массивным колонкам dtp_view (совпадение любой ТС/участника)
  { param:"VEHICLE_YEARS", preview:"Год выпуска ТС", min:1900, max:2100 },
  { param:"DRIVER_SERVICE_LENGTHS", preview:"Водительский стаж, лет", min:0, max:99 },
  { param:"MED_RESULT_PERMILLES", preview:"Промилле алкоголя", min:0, max:30 },
];
const filterMetadata = {
  severity: { 0:{ ui_tone:"none" }, 1:{ ui_tone:"light" }, 3:{ ui_tone:"serious" }, 4:{ ui_tone:"fatal" } },
  category: { fatal:["пешеход", "велосипед", "сим", "гужевой", "животное", "лицо", "падение пассажира", "опрокидывание", "съезд с дороги", "столкновение"], serious:["возгорание", "препятствие", "стоящее тс", "падение груза"] },
  violations: { fatal:["алкогол", "наркот", "встречн", "переезд", "скорост", "обгон", "пешеходн", "светофор", "опасн", "сон за рул", "переутом", "нетрудоспособност"], serious:["ремн", "мотошлем", "дет", "дистанц", "интервал", "перестроен", "преимущ", "очередност", "разворот", "задним ход", "сигнал", "разметк", "знак", "велосипед", "сим", "мопед", "мобильн"] }
};
function uiTone(filter, value) { const metadata = filterMetadata[filter.key || filter.name], text = String(value.preview || "").toLocaleLowerCase(); if (!metadata) return; if (metadata[value.value]) return metadata[value.value].ui_tone; return metadata.fatal?.some((term) => text.includes(term)) ? "fatal" : metadata.serious?.some((term) => text.includes(term)) ? "serious" : "light"; }
function enrichFilters(filters) { return filters.map((filter) => ({ ...filter, values:(filter.values || []).map((value) => ({ ...value, ...(uiTone(filter, value) ? { ui_tone:uiTone(filter, value) } : {}) })) })); }

function severity() { return [...document.querySelectorAll('input[name="severity"]:checked')].map((input) => Number(input.value)); }
function dynamicValues(filter) { return filter.key === "street" && !filter.values.length ? [...new Set(state.rawItems.map((item) => item.street).filter(Boolean))].sort().map((value) => ({ value, preview:value })) : filter.values || []; }
let filterReloadTimer: any;
// Живая перезагрузка данных при смене параметров про-фильтров (без кнопки «Применить»);
// для ввода с клавиатуры — с задержкой, для чекбоксов — сразу через loadMapData
function scheduleFilterReload() { clearTimeout(filterReloadTimer); filterReloadTimer = setTimeout(() => actions.loadMapData(), 500); }
// Каскадные секции (PLACE→регион, ROAD/STREET/NP→PLACE, MODEL→MARK): словари с
// сотнями тысяч значений не грузим на старте — тянем /dict/<имя>?parent_id=… только
// когда выбран родитель. На секции храним parentSel (подпись выбора родителя, для
// которой загружены values); смена родителя сбрасывает и выбор в самой секции
function cascadeParentIds(parent: string): number[] {
  if (parent === "REGION") return state.territory ? [state.territory.id] : [];
  return state.selectedFilters[parent] || [];
}
function cascadeSignature(name: string): string {
  const parent = sectionParents[name];
  return `${parent}:${cascadeParentIds(parent).join(",")}`;
}
// Словари секций грузим лениво: не на старте страницы, а при первом открытии
// про-панели (openAdvanced). Каскадные (PLACE/ROAD/STREET/NP/MODEL) — отдельно,
// в refreshCascade, по выбору родителя. loaded не даёт перекачивать при каждом
// открытии; при ошибке сети сбрасывается — следующее открытие повторит попытку
async function loadLazyDicts() {
  const jobs: Promise<void>[] = [];
  for (const filter of state.filters) {
    if (!filter.dict || filter.loaded || filter.values.length || sectionParents[filter.name]) continue;
    filter.loaded = true; filter.loading = true;
    jobs.push(apiFetch(`${api}/dict/${filter.dict}`).then((response) => response.ok ? response.json() : []).then((rows) => {
      filter.loading = false;
      filter.values = (rows || []).map((row) => ({ value:Number(row.id), preview:String(row.name) }));
    }).catch(() => { filter.loading = false; filter.loaded = false; }));
  }
  if (jobs.length) { renderAdvancedFilters(); await Promise.all(jobs); renderAdvancedFilters(); }
}
async function refreshCascade() {
  const jobs: Promise<void>[] = [];
  let dirty = false;
  // Родители раньше детей: смена выбора в PLACE перезагружает и ROAD/STREET/NP
  for (const name of ["PLACE", "ROAD", "STREET", "NP", "MODEL"]) {
    const filter = state.filters.find((item) => item.name === name);
    if (!filter || !sectionParents[name]) continue;
    const signature = cascadeSignature(name);
    if (filter.parentSel === signature) continue; // значения уже для этого родителя
    dirty = true;
    if (filter.parentSel !== undefined && filter.parentSel !== signature) delete state.selectedFilters[name]; // старый выбор при новом родителе невалиден
    const ids = cascadeParentIds(sectionParents[name]);
    filter.parentSel = signature; filter.values = []; filter.loading = Boolean(ids.length);
    if (!ids.length) continue;
    jobs.push(apiFetch(`${api}/dict/${filter.dict}?parent_id=${ids.join(",")}`).then((response) => response.ok ? response.json() : []).then((rows) => {
      if (filter.parentSel !== signature) return; // пока грузили, родитель снова сменился — придёт следующий refreshCascade
      filter.loading = false;
      filter.values = (rows || []).map((row) => ({ value:Number(row.id), preview:String(row.name) }));
    }).catch(() => { filter.loading = false; }));
  }
  if (dirty) renderAdvancedFilters(); // сброс/загрузка детей — сразу перерисовываем (хинты, «загружаем»)
  if (jobs.length) { await Promise.all(jobs); renderAdvancedFilters(); }
}
// Поисковая строка списка значений: ключ секции в data-param — по нему панель
// запоминает запросы при перерисовках (в аккордеоне места их до четырёх)
function advancedSearchInput(key: string, saved?: string) {
  const search = document.createElement("input");
  search.type = "search"; search.placeholder = t("search"); search.className = "advanced-search"; search.dataset.param = key;
  if (saved) search.value = saved;
  return search;
}
// Чекбоксы значений с живым поиском: выбор живёт в state.selectedFilters[key], смена
// перезагружает точки и детей каскада. Общие для секций и подгрупп аккордеона места.
// Мультиколонки — на внутренней обёртке: список сам мини-скролл, а multicol-переполнение
// уходит вбок и вертикально не прокручивается
function checkboxOptions(filter, options: HTMLElement, search: HTMLInputElement | null) {
  const key = filter.key || filter.name;
  const columns = document.createElement("div");
  columns.className = "advanced-columns";
  options.append(columns);
  const draw = () => { const query = search ? search.value.trim().toLowerCase() : "", selected = state.selectedFilters[key] || []; columns.replaceChildren(...dynamicValues(filter).filter((item) => item.preview.toLowerCase().includes(query)).map((item) => { const label = document.createElement("label"), input = document.createElement("input"); if (item.ui_tone) label.className = `filter-tone ${item.ui_tone}`; input.type = "checkbox"; input.checked = selected.includes(item.value); input.addEventListener("change", () => { const values = new Set(state.selectedFilters[key] || []); input.checked ? values.add(item.value) : values.delete(item.value); state.selectedFilters[key] = [...values]; actions.loadMapData(); refreshCascade(); }); label.append(input, document.createTextNode(item.preview)); return label; })); };
  if (search) { search.addEventListener("input", draw); search.addEventListener("keydown", (event) => event.stopPropagation()); }
  draw();
}
// Текст-подсказка каскадной секции: «загружаем» или какой родитель выбрать первым
function cascadeHint(filter, parent: string) { return t(filter.loading ? "loading" : parent === "REGION" ? "pickRegion" : parent === "PLACE" ? "pickPlace" : "pickMark"); }
// Аккордеон «Место ДТП»: список мест (каскад от региона) плюс подгруппы дорог, улиц
// и НП (каскад от места) — вместо трёх отдельных секций. У каждой подгруппы свой
// поиск и подсказки, выбор хранится в тех же ключах state.selectedFilters — серверные
// параметры PLACE_IDS/ROAD_IDS/STREET_IDS/NP_IDS не меняются
function placeGroupSection(place, children: any[], previous: Map<string, any>) {
  const saved = previous.get(place.label);
  const section = document.createElement("details"), title = document.createElement("summary"), name = document.createElement("span");
  section.className = "advanced-collapse";
  section.dataset.label = place.label;
  if (saved?.open) section.open = true;
  name.textContent = place.label;
  title.append(name);
  section.append(title);
  appendCascadeBlock(section, place, saved?.queries?.[place.key || place.name], false);
  for (const child of children) appendCascadeBlock(section, child, saved?.queries?.[child.key || child.name], true);
  return section;
}
// Блок одной каскадной секции: подсказка (родитель не выбран / словарь грузится) либо
// поиск + чекбоксы. subgroup=true добавляет заголовок подгруппы внутри аккордеона места
function appendCascadeBlock(section: HTMLElement, filter, query: string | undefined, subgroup: boolean) {
  const key = filter.key || filter.name, parent = sectionParents[key];
  let host: HTMLElement = section;
  if (subgroup) {
    host = document.createElement("div");
    host.className = "advanced-subgroup";
    const head = document.createElement("div");
    head.className = "advanced-subhead";
    head.textContent = filter.label;
    host.append(head);
    section.append(host);
  }
  if (filter.loading || (parent && !cascadeParentIds(parent).length)) {
    const hint = document.createElement("div");
    hint.className = "advanced-hint";
    hint.textContent = cascadeHint(filter, parent);
    host.append(hint);
    return;
  }
  const options = document.createElement("div");
  options.className = "advanced-options";
  const search = filter.key === "street" || filter.values.length > 8 ? advancedSearchInput(key, query) : null;
  host.append(...(search ? [search, options] : [options]));
  checkboxOptions(filter, options, search);
}
function renderAdvancedFilters() {
  const root = $("#advanced-dynamic");
  // Живая перезагрузка данных пересобирает панель — сохраняем раскрытые секции,
  // поисковые запросы (ключ — параметр секции, у аккордеона места их четыре) и фокус ввода
  const previous = new Map();
  for (const section of root.querySelectorAll(".advanced-collapse")) {
    const queries: Record<string, string> = {};
    for (const input of section.querySelectorAll(".advanced-search") as Iterable<HTMLInputElement>) if (input.dataset.param) queries[input.dataset.param] = input.value;
    previous.set(section.dataset.label, { open: section.open, queries });
  }
  const active = document.activeElement;
  let restore: { label: string; row?: string; input?: number; search?: boolean } | null = null;
  if (active instanceof HTMLInputElement) {
    const section = active.closest(".advanced-collapse"), row = active.closest(".advanced-interval");
    if (section) restore = row
      ? { label: (section as HTMLElement).dataset.label ?? "", row: row.querySelector("span")?.textContent ?? "", input: [...row.querySelectorAll("input")].indexOf(active) }
      : { label: (section as HTMLElement).dataset.label ?? "", search: active.classList.contains("advanced-search") };
  }
  // Место/дорога/улица/НП — один аккордеон: дети уходят подгруппами внутрь секции места
  const placeFilter = state.filters.find((filter) => filter.param && filter.name === "PLACE");
  const placeGroup = placeFilter ? ["ROAD", "STREET", "NP"].map((name) => state.filters.find((filter) => filter.param && filter.name === name)).filter(Boolean) : [];
  const grouped = new Set(placeGroup);
  const sections = state.filters.filter((filter) => filter.param && !grouped.has(filter)).map((filter) => {
    if (filter.name === "PLACE" && placeGroup.length) return placeGroupSection(filter, placeGroup, previous);
    const section = document.createElement("details"), title = document.createElement("summary"), name = document.createElement("span"), options = document.createElement("div"), key = filter.key || filter.name, saved = previous.get(filter.label);
    section.dataset.label = filter.label;
    name.textContent = filter.label;
    // Интервалы «от–до» — числовые поля вместо списка значений
    if (filter.key === "intervals") {
      section.className = "advanced-collapse"; options.className = "advanced-options advanced-intervals";
      if (saved?.open) section.open = true;
      const ru = state.language === "ru";
      for (const field of filter.values) {
        const range = state.selectedIntervals[field.param] || { from:"", to:"" }, row = document.createElement("div"), caption = document.createElement("span"), from = document.createElement("input"), to = document.createElement("input");
        row.className = "advanced-interval"; caption.textContent = field.preview;
        from.type = to.type = "number"; from.min = to.min = String(field.min); from.max = to.max = String(field.max); from.placeholder = to.placeholder = "";
        from.value = range.from; to.value = range.to;
        const sync = () => { if (from.value || to.value) state.selectedIntervals[field.param] = { from:from.value, to:to.value }; else delete state.selectedIntervals[field.param]; scheduleFilterReload(); };
        from.addEventListener("input", sync); to.addEventListener("input", sync);
        const mark = (text: string) => { const span = document.createElement("span"); span.textContent = text; return span; };
        const fromBox = document.createElement("label"); fromBox.className = "advanced-interval-field from"; fromBox.append(mark(ru ? "от" : "from"), from);
        const toBox = document.createElement("label"); toBox.className = "advanced-interval-field to"; toBox.append(mark(ru ? "до" : "to"), to);
        row.append(caption, fromBox, toBox); options.append(row);
      }
      title.append(name); section.append(title, options); return section;
    }
    // Поиск живёт внутри раскрытой секции — в свёрнутом заголовке только название и шеврон
    section.className = "advanced-collapse";
    if (saved?.open) section.open = true;
    // Не загруженная (ленивый словарь) или каскадная без выбранного родителя —
    // подсказка вместо списка; в процессе загрузки — «загружаем»
    const parent = sectionParents[key];
    if (filter.loading || (parent && !cascadeParentIds(parent).length)) {
      title.append(name);
      options.className = "advanced-hint";
      options.textContent = cascadeHint(filter, parent);
      section.append(title, options); return section;
    }
    options.className = "advanced-options";
    const search = filter.key === "street" || filter.values.length > 8 ? advancedSearchInput(key, saved?.queries?.[key]) : null;
    title.append(name);
    checkboxOptions(filter, options, search);
    if (search) section.append(title, search, options);
    else section.append(title, options);
    return section;
  });
  root.replaceChildren(...sections);
  if (restore) {
    const section = sections.find((item) => item.dataset.label === restore.label);
    if (section) {
      section.open = true;
      if (restore.search) section.querySelector<HTMLInputElement>(".advanced-search")?.focus();
      else if (restore.row !== undefined) { const row = [...section.querySelectorAll(".advanced-interval")].find((item) => item.querySelector("span")?.textContent === restore.row); const inputs = row ? [...row.querySelectorAll<HTMLInputElement>("input")] : []; inputs[restore.input ?? 0]?.focus(); }
    }
  }
}
function openAdvanced() { renderAdvancedControls(); renderAdvancedFilters(); syncAdvancedRegion(); loadLazyDicts(); refreshCascade(); document.body.classList.add("advanced-open"); setAdvancedCollapsed(false); $("#advanced-filter").hidden = false; }
// Регион про-панели — то же поле с подсказками, что в стандартной панели; можно впечатать вручную (DTP-25).
// Подсказки прижаты к ПРАВОМУ краю поля. Пустой ввод + Enter (или кнопка сброса) возвращает «Все регионы»
function syncAdvancedRegion() {
  // Тот же «эффективный» регион, что и в стандартной панели: замок ?? субъект под центром
  syncRegionFields();
}
function drawAdvancedRegionSuggest() {
  const input = $("#advanced-region") as HTMLInputElement, suggest = $("#region-suggest-adv");
  if (document.activeElement !== input && !input.value.trim()) { suggest.hidden = true; suggest.replaceChildren(); return; }
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
  suggest.replaceChildren(...matches.map((region) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = region.name;
    button.addEventListener("mousedown", (event) => { event.preventDefault(); selectRegion(region); syncAdvancedRegion(); suggest.hidden = true; });
    return button;
  }));
  if (!matches.length) suggest.append(Object.assign(document.createElement("p"), { className:"region-suggest-empty", textContent:t("noMatches") }));
}
function advancedRegionCommit() {
  const input = $("#advanced-region") as HTMLInputElement, suggest = $("#region-suggest-adv");
  if (state.territory) { suggest.hidden = true; return; } // замок: смену региона не даём (DTP-28)
  const query = input.value.trim().toLowerCase();
  if (!query) { state.territory = null; updateTerritoryCard(); suggest.hidden = true; refreshCascade(); actions.loadMapData(); return; }
  const first = regionIndex.find((region) => region.lower.includes(query));
  if (first) { selectRegion(first); syncAdvancedRegion(); }
  suggest.hidden = true;
}
function closeAdvanced() { document.body.classList.remove("advanced-open"); setAdvancedCollapsed(false); $("#advanced-filter").hidden = true; $("#filters").hidden = false; }
function setAdvancedCollapsed(collapsed) { document.body.classList.toggle("advanced-collapsed", collapsed); const button = $("#close-advanced"); button.textContent = collapsed ? activeFiltersLabel() : "‹"; button.setAttribute("aria-expanded", String(!collapsed)); }
// Семантика фильтров: МЕЖДУ группами — И (участники × тяжесть × секции), ВНУТРИ группы — ИЛИ.
// У точки один тип ДТП, поэтому отмеченные типы («Типы ДТП») дают «любой из отмеченных»:
// скалярная ветка values.includes(item[key]) истинна при совпадении хоть с одним значением
function passesFilters(item, emTypes, levels, categories) {
  return (!emTypes || emTypes.includes(item.category)) && (!levels.length || levels.includes(item.severity)) && categories.every(([key, values]) => Array.isArray(item[key]) ? item[key].some((value) => values.includes(value)) : values.includes(item[key]));
}
// Параметры серверной фильтрации /dtp/points: выбранные секции-словари, признаки-маски и интервалы
function serverQuery() {
  const params = new URLSearchParams();
  // Участники с серверной маской (например «Дети» → UNDER_16=3). ИЛИ между клиентскими
  // участниками (Пешеходы/Велосипедисты, participantEmTypes) и «Детьми» невыразимо:
  // OR-масок у бэкенда нет, признаков участников в точках тоже. Маску отправляем только
  // если выбраны ТОЛЬКО участники с маской — «Все участники» (без ограничения) и
  // клиенты-участники её отключают. Иначе серверная маска совмещалась бы с клиентским
  // ИЛИ по И («Пешеходы»+«Дети» давало бы почти пустое пересечение). В смешанном выборе
  // остаются клиентские виды ДТП: дети-пешеходы попадают в «Наезд на пешехода»,
  // теряются только дети из других видов ДТП — это осознанная аппроксимация ИЛИ
  const selected = selectedParticipants();
  if (selected.length && !selected.includes(1) && selected.every((value) => participantConfig[value]?.mask))
    for (const value of selected) { const mask = participantConfig[value]?.mask; if (mask) params.append(mask.param, String(mask.value)); }
  // Участники «Мотоциклисты»/«Общ. транспорт» → типы ТС параметром PROD_TYPE_IDS
  // (kind 'arrays', условие && на бэкенде — ИЛИ внутри списка, мото+общ.транспорт объединяются).
  // Шлётся только когда выбраны ТОЛЬКО участники этого механизма: вместе с маской/видами ДТП
  // серверное И дало бы пересечение вместо объединения — смешанный выбор остаётся клиентским
  const participantProdTypeList = participantProdTypeIds();
  if (participantProdTypeList) params.append("PROD_TYPE_IDS", participantProdTypeList.join(","));
  for (const [name, values] of Object.entries(state.selectedFilters)) {
    if (!values.length) continue;
    if (name === "masks") for (const value of values) { const feature = maskFeatures.find((item) => item.value === value); if (feature) params.append(feature.param, String(feature.value)); }
    else if (serverSections.includes(name)) params.append(`${name}_IDS`, values.join(","));
  }
  for (const [param, range] of Object.entries(state.selectedIntervals)) {
    if (range.from) params.append(`${param}_FROM`, range.from);
    if (range.to) params.append(`${param}_TO`, range.to);
  }
  return params;
}
// Фильтрация пересчитывается только при смене данных/фильтров,
// при панорамировании берётся готовый результат
const filterCache = { key: "", filtered: [] as any[] };
function filteredPoints() {
  // Клиентски фильтруются только секции, чьи поля есть в точках (тип ДТП, тяжесть, участники);
  // серверные секции (serverSections) уже отфильтрованы при загрузке /dtp/points
  const emTypes = participantEmTypes(), levels = severity();
  const selected = Object.entries(state.selectedFilters).filter(([key, values]) => values.length && !serverSections.includes(key));
  const key = `${state.rawItemsKey}|${emTypes?.join(",")}|${levels.join(",")}|${JSON.stringify(selected)}`;
  if (filterCache.key !== key) {
    filterCache.filtered = state.rawItems.filter((item) => item.point && passesFilters(item, emTypes, levels, selected));
    filterCache.key = key;
  }
  return filterCache.filtered;
}

function setFiltersCollapsed(collapsed) { $("#filters").classList.toggle("collapsed", collapsed); document.body.classList.toggle("filters-collapsed", collapsed); $("#hide-filters").textContent = collapsed ? activeFiltersLabel() : "‹"; $("#hide-filters").setAttribute("aria-expanded", String(!collapsed)); if (collapsed) { $("#advanced-filter").hidden = true; $("#filters").hidden = false; } }
let defaultPeriod: { start: string; end: string } | null = null;
let defaultParticipants = "";
function activeFiltersCount() {
  if (!defaultPeriod) defaultPeriod = period();
  if (!defaultParticipants) defaultParticipants = selectedParticipants().sort().join(",");
  const { start, end } = period();
  let count = 0;
  if (start !== defaultPeriod.start || end !== defaultPeriod.end) count++;
  if (state.territory) count++;
  if (selectedParticipants().sort().join(",") !== defaultParticipants) count++;
  const severityInputs = [...document.querySelectorAll('input[name="severity"]')] as HTMLInputElement[];
  if (severityInputs.length && severityInputs.some((input) => !input.checked)) count++;
  if (serverQuery().size) count++;
  return count;
}
function activeFiltersLabel() {
  const count = activeFiltersCount();
  if (state.language !== "ru") return `${t("filters")} (${count} active)`;
  return `${t("filters")} (${count} ${count % 10 === 1 && count % 100 !== 11 ? "активный" : "активных"})`;
}

export { serverSections, serverSectionLabels, maskFeatures, intervalFields, enrichFilters, refreshCascade, renderAdvancedFilters, openAdvanced, syncAdvancedRegion, drawAdvancedRegionSuggest, advancedRegionCommit, closeAdvanced, setAdvancedCollapsed, serverQuery, filteredPoints, setFiltersCollapsed };
