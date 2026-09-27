// Локально (npm run serve) API доступен по тому же origin: serve.mjs проксирует /api на dtpstat-backend.7190805.xyz;
// иначе — напрямую на бэкенд через cloudflare-туннель (там валидный сертификат, CORS открыт)
const api = ["localhost", "127.0.0.1"].includes(location.hostname) ? "/api" : "https://dtpstat-backend.7190805.xyz/api";
const $ = (selector) => document.querySelector(selector);
const dataRange = { min:"2015-01-01", max:"2026-08-31" };
type MapState = { language: string; mapClient: "leaflet" | "yandex" | "mapbox"; participants: any[]; filters: any[]; selectedFilters: Record<string, any[]>; selectedIntervals: Record<string, { from: string; to: string }>; territory: { id: number; name: string } | null; abort: AbortController | null; items: any[]; rawItems: any[]; rawItemsKey: string; dataLoadId: number; chartMode: string; minDate: string; maxDate: string; bboxSupported: boolean };
type Bounds = { west: number; south: number; east: number; north: number };
const persistedMapClient = localStorage.getItem("map-client");
const state: MapState = { language: new URLSearchParams(location.search).get("lang") || localStorage.getItem("language") || "ru", mapClient: persistedMapClient === "yandex" || persistedMapClient === "mapbox" ? persistedMapClient : "leaflet", participants: [], filters: [], selectedFilters: {}, selectedIntervals: {}, territory: null, abort: null, items: [], rawItems: [], rawItemsKey: "", dataLoadId: 0, chartMode: "days", minDate: "2015-01-01", maxDate: "2024-12-31", bboxSupported: false };
// Кэш загруженных точек: ключ запроса (период + фильтры) → ключ набора (регион или рамка) → точки.
// Новые наборы докачиваются по одному, уже скачанные не запрашиваются повторно.
const regionCache = new Map<string, Map<string, any[]>>();
const copy = {
  ru: { brandAria:"Карта ДТП — главная", mapAria:"Интерактивная карта ДТП", map:"Карта", blog:"Блог и исследования", data:"Скачать данные", about:"О проекте", team:"Команда", support:"Поддержать проект", statistics:"Статистика", filters:"Фильтры", analytics:"Аналитика", cancel:"Отмена", backToBasic:"Назад к стандартным фильтрам", allTime:"За всё время", basicFilter:"Базовый фильтр", professionalFilter:"Профессиональные фильтры", search:"Поиск", dataPeriod:"Период данных", accidentsInRussia:"ДТП в России", region:"Регион", allRegions:"Все регионы", from:"С", to:"По", participants:"Участники ДТП", injurySeverity:"Вред здоровью", light:"Лёгкий", serious:"Тяжёлый", fatal:"С погибшими", accidentTypes:"Типы ДТП", weather:"Погода", heatRadius:"Радиус", heatBlur:"Размытие", heatOpacity:"Мин. непрозрачность", loading:"Загружаем данные…", loadingMap:"Обновляем карту…", unavailable:"Не удалось получить данные. Попробуйте позднее.", officialData:"Официальные данные", accidents:"ДТП", injured:"Пострадали", dead:"Погибли", distribution:"Распределение ДТП", selectedPeriod:"За выбранный период", byDays:"По дням", byHours:"По часам", byTypes:"По типам ДТП", chartNote:"Диаграмма построена по ДТП в видимой области.", chartNoDates:"В открытом API у точек ДТП нет даты и времени — временные разрезы недоступны", chartRangeTooLong:"Период в фильтре слишком длинный для этого разреза", forPeriod:"За период", activeFilters:"Активные фильтры", hide:"Скрыть", timeIntervals:"Временные интервалы", accidentProperties:"Свойства ДТП", accidentsCount:"Количество ДТП", deathsLegend:"Погибшие", byMonths:"По месяцам", byYears:"По годам", chartTitleDays:"Распределение по дням", chartTitleHours:"Распределение по часам", chartTitleMonths:"Распределение по месяцам", chartTitleYears:"Распределение по годам", chartTitleTypes:"Распределение по типам", accidentsInArea:"ДТП в видимой области", people:"чел.", deaths:"погибших", roadConditions:"УДС на месте ДТП", roadConditionsNear:"УДС поблизости", roadFactors:"Факторы, влияющие на движение", roadDefects:"Повреждения УДС", lighting:"Освещение", roadSurface:"Состояние проезжей части", movementChange:"Изменение движения", participantType:"Вид участника", seatBelt:"Ремень безопасности", sex:"Пол", harmSeverity:"Тяжесть вреда здоровью", ruleViolations:"Нарушения ПДД", attendantViolations:"Дополнительные нарушения ПДД", vehicleEscape:"Скрылось с места ДТП (ТС)", participantEscape:"Скрылся с места ДТП (участник)", childRestraint:"Детские удерживающие устройства", damageDisposition:"Места повреждений ТС", techFailure:"Технические неисправности", places:"Место ДТП", roads:"Дорога", streets:"Улица", nps:"Населённый пункт", marks:"Марка ТС", models:"Модель ТС", pickRegion:"Сначала выберите регион", pickPlace:"Сначала выберите место ДТП", pickMark:"Сначала выберите марку ТС", signs:"Признаки ДТП", quantity:"Количество" },
  en: { brandAria:"Road accident map — home", mapAria:"Interactive road accident map", map:"Map", blog:"Blog & research", data:"Download data", about:"About the project", team:"Team", support:"Support the project", statistics:"Statistics", filters:"Filters", analytics:"Analytics", cancel:"Cancel", backToBasic:"Back to standard filters", allTime:"All time", basicFilter:"Basic filter", professionalFilter:"Professional filters", search:"Search", dataPeriod:"Data period", accidentsInRussia:"Road accidents in Russia", region:"Region", allRegions:"All regions", from:"From", to:"To", participants:"Road users", injurySeverity:"Injury severity", light:"Minor", serious:"Serious", fatal:"Fatal", accidentTypes:"Accident types", weather:"Weather", heatRadius:"Radius", heatBlur:"Blur", heatOpacity:"Min. opacity", loading:"Loading data…", loadingMap:"Updating map…", unavailable:"Could not load data. Please try again later.", officialData:"Official data", accidents:"Accidents", injured:"Injured", dead:"Deaths", distribution:"Distribution", selectedPeriod:"Selected period", byDays:"By day", byHours:"By hour", byTypes:"By type", chartNote:"The chart is based on accidents in the visible area.", chartNoDates:"The open API has no date or time for accident points — time breakdowns are unavailable", chartRangeTooLong:"The selected period is too long for this breakdown", forPeriod:"For the period", activeFilters:"Active filters", hide:"Hide", timeIntervals:"Time intervals", accidentProperties:"Accident properties", accidentsCount:"Accident count", deathsLegend:"Deaths", byMonths:"By month", byYears:"By year", chartTitleDays:"Distribution by day", chartTitleHours:"Distribution by hour", chartTitleMonths:"Distribution by month", chartTitleYears:"Distribution by year", chartTitleTypes:"Distribution by type", accidentsInArea:"Accidents in area", people:"people", deaths:"deaths", roadConditions:"Road conditions on site", roadConditionsNear:"Road conditions nearby", roadFactors:"Factors affecting traffic", roadDefects:"Road defects", lighting:"Lighting", roadSurface:"Road surface", movementChange:"Traffic disruption", participantType:"Participant type", seatBelt:"Seat belt", sex:"Sex", harmSeverity:"Injury outcome", ruleViolations:"Traffic violations", attendantViolations:"Additional traffic violations", vehicleEscape:"Fled the scene (vehicle)", participantEscape:"Fled the scene (participant)", childRestraint:"Child restraints", damageDisposition:"Vehicle damage areas", techFailure:"Technical failures", places:"Location", roads:"Road", streets:"Street", nps:"Locality", marks:"Vehicle make", models:"Vehicle model", pickRegion:"Select a region first", pickPlace:"Select locations first", pickMark:"Select vehicle makes first", signs:"Accident features", quantity:"Counts" },
};
Object.assign(copy.ru, { regionSearch:"Введите адрес или регион", noInjured:"Без пострадавших (нет данных)", accidentKind:"Вид ДТП", show:"Показать", lockPin:"Данные закреплены по территории", unlock:"Открепить данные", lockHint:"Сначала открепите территорию", participantNoData:"По этим участникам в открытом API нет данных", noMatches:"Ничего не найдено" });
Object.assign(copy.en, { regionSearch:"Enter address or region", noInjured:"No injuries (no data)", accidentKind:"Accident type", show:"Show", lockPin:"Data is pinned to the territory", unlock:"Unpin data", lockHint:"Unpin the territory first", participantNoData:"No open API data for these road users", noMatches:"Nothing found" });
Object.assign(copy.ru, { heatIntensity:"Интенсивность", heatMapOpacity:"Непрозрачность" });
Object.assign(copy.en, { heatIntensity:"Intensity", heatMapOpacity:"Opacity" });
const participantTranslations = { "Все участники":"All users", "Пешеходы":"Pedestrians", "Велосипедисты":"Cyclists", "Мотоциклисты":"Motorcyclists", "Общ. транспорт":"Public transport", "Дети":"Children", "Без участника":"No road user" };
// Иконка и приближение по виду ДТП для каждой кнопки участников (значения как на dtp-stat.ru).
// emTypes — клиентский фильтр по em_type_id точек; mask — серверный признак /dtp/points;
// prodTypes — серверный фильтр по типам ТС из vehicles (PROD_TYPE_IDS, словарь prod_types).
// В открытых точках мотоциклисты/общ. транспорт не различаются (PART_TYPE знает только
// водитель/пешеход/пассажир/велосипедист), но различимы по ТС в базе — плитка уходит
// параметром PROD_TYPE_IDS. Списки — без экзотики: мотоблоки (88), мотоколяски (96),
// мотонарты (109); школьные (76) и детские (97) перевозки — не маршрутный общественный транспорт.
const participantConfig: Record<number, { icon: string; emTypes?: number[]; mask?: { param: string; value: number }; prodTypes?: number[] }> = {
  1: { icon:"all" },
  2: { icon:"pedestrian", emTypes:[1] },
  3: { icon:"cyclist", emTypes:[8] },
  4: { icon:"motorcycle", prodTypes:[7,33,34,35,36,39,41,75,78,85] },
  5: { icon:"public_transport", prodTypes:[63,95,99,106,107,108,21,30,42,51,67] },
  // «С детьми до 16 лет» — маска CHILDREN_ATTR=3 в /dtp/filter_fields
  6: { icon:"kids", mask:{ param:"UNDER_16", value:3 } },
};
// Выбор у всех плиток доступен; данные после выбора меняют emTypes, маски и типы ТС
function participantHasData(participant) { return participant.value === 1 || Boolean(participantConfig[participant.value]?.emTypes || participantConfig[participant.value]?.mask || participantConfig[participant.value]?.prodTypes); }
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
// Названия видов ДТП из /dict/em_types — заполняется в loadFilters
const emTypeNames = new Map<number, string>();
const filterMetadata = {
  severity: { 0:{ ui_tone:"none" }, 1:{ ui_tone:"light" }, 3:{ ui_tone:"serious" }, 4:{ ui_tone:"fatal" } },
  category: { fatal:["пешеход", "велосипед", "сим", "гужевой", "животное", "лицо", "падение пассажира", "опрокидывание", "съезд с дороги", "столкновение"], serious:["возгорание", "препятствие", "стоящее тс", "падение груза"] },
  violations: { fatal:["алкогол", "наркот", "встречн", "переезд", "скорост", "обгон", "пешеходн", "светофор", "опасн", "сон за рул", "переутом", "нетрудоспособност"], serious:["ремн", "мотошлем", "дет", "дистанц", "интервал", "перестроен", "преимущ", "очередност", "разворот", "задним ход", "сигнал", "разметк", "знак", "велосипед", "сим", "мопед", "мобильн"] }
};
// Форматтеры Intl дорогие — создаём один раз на язык (в попапах их ждут тысячи точек)
const intlCache = new Map<string, any>();
function intlFormatter(kind: string, options: Intl.DateTimeFormatOptions | undefined) {
  const key = `${kind}:${state.language}`;
  let formatter = intlCache.get(key);
  if (!formatter) {
    const locale = state.language === "ru" ? "ru-RU" : "en-US";
    formatter = kind === "number" ? new Intl.NumberFormat(locale) : new Intl.DateTimeFormat(locale, options);
    intlCache.set(key, formatter);
  }
  return formatter;
}
const number = () => intlFormatter("number", undefined) as Intl.NumberFormat;
const t = (key) => copy[state.language][key];
function uiTone(filter, value) { const metadata = filterMetadata[filter.key || filter.name], text = String(value.preview || "").toLocaleLowerCase(); if (!metadata) return; if (metadata[value.value]) return metadata[value.value].ui_tone; return metadata.fatal?.some((term) => text.includes(term)) ? "fatal" : metadata.serious?.some((term) => text.includes(term)) ? "serious" : "light"; }
function enrichFilters(filters) { return filters.map((filter) => ({ ...filter, values:(filter.values || []).map((value) => ({ ...value, ...(uiTone(filter, value) ? { ui_tone:uiTone(filter, value) } : {}) })) })); }

function period() { return { start: $("#start-date").value, end: $("#end-date").value }; }
function severity() { return [...document.querySelectorAll('input[name="severity"]:checked')].map((input) => Number(input.value)); }
function selectedParticipants() { return state.participants.filter((participant) => participant.selected).map((participant) => participant.value); }
function setStatus(message) { $("#filter-status").textContent = message; }
function monthEndValue(value) { const [year, month] = value.split("-").map(Number); return `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`; }

// Период данных: поле «ДД.ММ.ГГГГ - ДД.ММ.ГГГГ» + дропдаун пресетов (как на dtp-stat.ru):
// последний месяц с данными, предыдущий, годы и «За всё время»
function formatDate(value) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }

function renderDateFields() {
  const value = `${formatDate($("#start-date").value)} - ${formatDate($("#end-date").value)}`;
  document.querySelectorAll("#date-range-value, #advanced-date-range-value").forEach((node) => { if (node !== document.activeElement) (node as HTMLInputElement).value = value; });
  document.querySelectorAll("#date-range-button, #advanced-date-range-button").forEach((node) => node.setAttribute("aria-expanded", String(!$("#date-menu").hidden)));
}

function dateMenuPresets() {
  const today = new Date(), todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const maximum = dataRange.max < todayValue ? dataRange.max : todayValue;
  const [maxYear, maxMonth] = maximum.split("-").map(Number);
  const lastMonthStart = `${maxYear}-${String(maxMonth).padStart(2, "0")}-01`;
  const previous = new Date(maxYear, maxMonth - 2, 1), previousStart = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-01`;
  const monthName = (start) => { const name = intlFormatter("month", { month: "long" }).format(new Date(`${start}T00:00:00`)); return name.charAt(0).toUpperCase() + name.slice(1); };
  const firstYear = Math.max(Number(dataRange.min.slice(0, 4)), maxYear - 5);
  const presets = [
    { label: monthName(lastMonthStart), start: lastMonthStart, end: monthEndValue(lastMonthStart) },
    { label: monthName(previousStart), start: previousStart, end: monthEndValue(previousStart) },
  ];
  for (let year = maxYear; year >= firstYear; year--) presets.push({ label: String(year), start: `${year}-01-01`, end: `${year}-12-31` });
  presets.push({ label: t("allTime"), start: dataRange.min, end: todayValue });
  return presets;
}

// ДД.ММ.ГГГГ → YYYY-MM-DD, иначе null (ручной ввод периода)
function parseManualDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00`);
  return date.getDate() === Number(match[1]) && date.getMonth() + 1 === Number(match[2]) ? iso : null;
}

// Маска поля периода: 16 цифр → «ДД.ММ.ГГГГ - ДД.ММ.ГГГГ»
function maskRangeDigits(digits) {
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `.${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `.${digits.slice(4, 8)}`;
  if (digits.length > 8) out += ` - ${digits.slice(8, 10)}`;
  if (digits.length > 10) out += `.${digits.slice(10, 12)}`;
  if (digits.length > 12) out += `.${digits.slice(12, 16)}`;
  return out;
}

// Применение отредактированного периода (Enter/потеря фокуса): при ошибке — откат, иначе swap перепутанных дат и клэмп к диапазону данных
function applyRangeInput(input) {
  const [rawStart, rawEnd] = input.value.split(" - ");
  const start = parseManualDate(rawStart || ""), end = parseManualDate(rawEnd || "");
  if (!start || !end) { renderDateFields(); return; }
  let [from, till] = start <= end ? [start, end] : [end, start];
  const now = new Date(), todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (from < dataRange.min) from = dataRange.min;
  if (till > todayValue) till = todayValue;
  if (from > till) from = till;
  if ($("#start-date").value === from && $("#end-date").value === till) { renderDateFields(); return; }
  $("#start-date").value = from; $("#end-date").value = till;
  renderDateFields(); loadMapData();
}

function renderDateMenu() {
  const menu = $("#date-menu");
  menu.replaceChildren(...dateMenuPresets().map((preset) => { const item = document.createElement("div"); item.className = "date-value"; item.textContent = preset.label; item.addEventListener("click", () => { $("#start-date").value = preset.start; $("#end-date").value = preset.end; closeDateMenu(); loadMapData(); }); return item; }));
}

function closeDateMenu() { dateMenuButton = null; $("#date-menu").hidden = true; renderDateFields(); }

function openDateMenu(button) {
  const menu = $("#date-menu");
  if (dateMenuButton === button && !menu.hidden) { closeDateMenu(); return; }
  renderDateMenu();
  dateMenuButton = button;
  menu.hidden = false;
  const rect = (button.closest(".date-range") || button).getBoundingClientRect();
  menu.style.top = `${Math.round(rect.bottom + 4)}px`;
  const width = menu.offsetWidth || 200;
  let left = rect.left;
  if (left + width > window.innerWidth - 12) left = window.innerWidth - 12 - width;
  menu.style.left = `${Math.round(Math.max(left, 12))}px`;
  renderDateFields();
}
let dateMenuButton: Element | null = null;

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.title = state.language === "ru" ? "Карта ДТП" : "Road accident map";
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { (node as HTMLInputElement).placeholder = t(node.dataset.i18nPlaceholder); });
  renderParticipants();
  renderAdvancedControls();
  renderAdvancedFilters();
  renderDateFields();
  closeDateMenu();
  renderHeatControls();
  // Открытая статистика перерисовывается: пояснение и подписи на вкладках зависят от языка
  if (!$("#chart").hidden) renderChart();
}

function participantLabel(participant) { return state.language === "en" ? (participantTranslations[participant.preview] || participant.preview) : participant.preview; }
function renderParticipants() {
  const root = $("#participants");
  root.replaceChildren(...state.participants.slice(0, 6).map((participant) => {
    const button = document.createElement("button");
    button.type = "button";
    const icon = document.createElement("img"); icon.src = `assets/icons/${participantConfig[participant.value]?.icon || "all"}.svg`; icon.alt = "";
    const label = document.createElement("span"); label.textContent = participantLabel(participant);
    button.append(icon, label);
    button.classList.toggle("active", participant.selected);
    button.setAttribute("aria-pressed", String(participant.selected));
    button.addEventListener("click", () => {
      // Повторный клик по выбранному участнику, как и клик по «Все участники», возвращает всех
      const value = participant.selected && participant.value !== 1 ? 1 : participant.value;
      const filterBefore = participantFilterKey();
      state.participants.forEach((item) => { item.selected = item.value === value; });
      renderParticipants();
      // У мото/общ. транспорта данных в открытом API нет: выбор сохраняем, точки не трогаем — сообщаем честно
      if (participant.selected && !participantHasData(participant)) setStatus(t("participantNoData"));
      else if (participantFilterKey() !== filterBefore) loadMapData();
    });
    return button;
  }));
  $("#collapsed-summary").textContent = state.participants.filter((participant) => participant.selected).map(participantLabel).join(", ");
}
function renderAdvancedControls() {
  const participants = $("#advanced-participants"), severity = $("#advanced-severity");
  participants.replaceChildren(...state.participants.map((participant) => { const label = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.checked = participant.selected; input.addEventListener("change", () => { // «Все участники» исключает остальные, любой конкретный — снимает «Все»
    const filterBefore = participantFilterKey();
    if (input.checked && participant.value === 1) state.participants.forEach((item) => { item.selected = item.value === 1; });
    else { participant.selected = input.checked; if (input.checked) { const all = state.participants.find((item) => item.value === 1); if (all) all.selected = false; } }
    renderParticipants();
    // Мото/общ. транспорт: галочка ставится, но данных в открытом API нет — точки не перезагружаем
    if (participant.selected && !participantHasData(participant)) setStatus(t("participantNoData"));
    else if (participantFilterKey() !== filterBefore) loadMapData();
  }); label.append(input, document.createTextNode(participantLabel(participant))); return label; }));
  severity.replaceChildren(...[...document.querySelectorAll<HTMLInputElement>('input[name="severity"]')].map((source) => { const value = Number(source.value), tone = state.filters.find((filter) => filter.name === "severity")?.values.find((item) => item.value === value)?.ui_tone || "light", label = document.createElement("label"), input = document.createElement("input"); label.className = `severity-tone ${tone}`; input.type = "checkbox"; input.checked = source.checked; input.disabled = source.disabled; input.addEventListener("change", () => { source.checked = input.checked; loadMapData(); }); label.append(input, document.createTextNode(source.parentElement.textContent.trim())); return label; }));
}

function chartBuckets() {
  const groups = new Map();
  for (const item of state.items) {
    // Разрезы по времени доступны только для точек с датой (сейчас в открытом API её нет)
    if (state.chartMode !== "types" && !item.datetime) continue;
    // Часы 0–23 → колонки 1–24 («1-й час» = 00:00–01:00 … «24-й» = 23:00–24:00)
    const key = state.chartMode === "hours" ? String(Number(item.datetime.slice(11, 13)) + 1) : state.chartMode === "days" ? item.datetime.slice(0, 10) : state.chartMode === "months" ? item.datetime.slice(0, 7) : state.chartMode === "years" ? item.datetime.slice(0, 4) : item.category_name;
    const bucket = groups.get(key) || { count: 0, dead: 0 };
    bucket.count++; bucket.dead += Number(item.dead || 0);
    groups.set(key, bucket);
  }
  const values = [...groups.entries()].sort((a, b) => state.chartMode === "types" ? b[1].count - a[1].count : a[0].localeCompare(b[0], undefined, { numeric: true }));
  // Типы — топ-10; время — вся ось с нулями: часы 1–24, дни 1–31, месяцы 1–12, годы
  if (state.chartMode === "types") return values.slice(0, 10);
  const axis = chartAxis(state.chartMode);
  return axis ? axis.map((key) => [key, groups.get(key) || { count: 0, dead: 0 }]) : values;
}

// Полная ось X временных разрезов — весь период запроса: все дни (лимит 90), все месяцы (лимит 90),
// годы диапазона, часы 1–24. null = разрез при таком периоде недоступен
function chartAxis(mode: string) {
  const { start, end } = period();
  const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
  if (mode === "hours") return span(1, 24);
  if (!start || !end || end < start) return null;
  if (mode === "years") return span(Number(start.slice(0, 4)), Number(end.slice(0, 4)));
  if (mode === "days") {
    const keys: string[] = [];
    for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) keys.push(d.toISOString().slice(0, 10));
    return keys.length <= 90 ? keys : null;
  }
  if (mode === "months") {
    const keys: string[] = [];
    for (let d = new Date(`${start.slice(0, 7)}-01T00:00:00Z`); d <= new Date(`${end.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) keys.push(d.toISOString().slice(0, 7));
    return keys.length <= 90 ? keys : null;
  }
  return null;
}

// Дни/часы требуют дату точки: в открытом API её нет — табы отключаем с пояснением.
// Если даты появились (мок e2e, будущий бэкенд с рамкой) — включаются сами
const chartDatesAvailable = () => state.items.some((item) => item.datetime);
function setChartMode(mode: string) { state.chartMode = mode; document.querySelectorAll("#chart-side button[data-mode]").forEach((item) => item.classList.toggle("active", item.dataset.mode === mode)); }
function updateChartTabs() {
  const dates = chartDatesAvailable();
  document.querySelectorAll("#chart-side button[data-mode]").forEach((button) => {
    const mode = button.dataset.mode;
    const unavailable = mode !== "types" && (!dates || chartAxis(mode) === null);
    button.disabled = unavailable;
    button.title = button.disabled ? (!dates ? t("chartNoDates") : t("chartRangeTooLong")) : "";
  });
  // Свойства без данных в открытом API не показываем вовсе — в панели только «Типы ДТП»
}
function chartTitle() { return { days: t("chartTitleDays"), hours: t("chartTitleHours"), months: t("chartTitleMonths"), years: t("chartTitleYears"), types: t("chartTitleTypes") }[state.chartMode] || t("distribution"); }
// Строка «Активные фильтры: …» — участники, вред здоровью, про-фильтры и интервалы
function activeFiltersSummary() {
  const ru = state.language === "ru", all = ru ? "все" : "all", parts = [];
  const selected = state.participants.filter((participant) => participant.selected);
  const participants = !selected.length || selected.length === state.participants.length ? all : selected.map(participantLabel).join(", ");
  parts.push(`${t("participants")} (${participants})`);
  const severities = [...document.querySelectorAll<HTMLInputElement>('input[name="severity"]:checked')].map((input) => input.parentElement.textContent.trim());
  parts.push(`${t("injurySeverity")} (${severities.length === 3 ? all : severities.join(", ") || all})`);
  for (const filter of state.filters) {
    const values = state.selectedFilters[filter.key || filter.name];
    if (values?.length) parts.push(`${filter.label}: ${values.length}`);
  }
  const intervals = Object.keys(state.selectedIntervals).length;
  if (intervals) parts.push(ru ? `интервалы: ${intervals}` : `intervals: ${intervals}`);
  return parts.join(", ");
}

function renderChart() {
  const bars = $("#bars"), empty = $("#chart-empty");
  updateChartTabs();
  // Шапка дэшборда дублирует карточку статистики — значения из одного источника
  $("#chart-region").textContent = state.territory ? state.territory.name : t("allRegions");
  $("#chart-count").textContent = $("#count").textContent;
  $("#chart-injured-count").textContent = $("#injured").textContent;
  $("#chart-dead-count").textContent = $("#dead").textContent;
  $("#chart-title").textContent = chartTitle();
  $("#chart-period").textContent = `${t("forPeriod")}: ${($("#date-range-value") as HTMLInputElement).value}`;
  $("#chart-filters").textContent = `${t("activeFilters")}: ${activeFiltersSummary()}`;
  // Нет дат у точек или период слишком длинный — честное пояснение вместо пустой области графика
  if (state.chartMode !== "types" && !chartDatesAvailable()) {
    empty.textContent = t("chartNoDates");
    empty.hidden = false; bars.hidden = true;
    return;
  }
  if (state.chartMode !== "types" && chartAxis(state.chartMode) === null) {
    empty.textContent = t("chartRangeTooLong");
    empty.hidden = false; bars.hidden = true;
    return;
  }
  empty.hidden = true; bars.hidden = false;
  const values = chartBuckets();
  // Оси до «красивых» пределов (1/2/5×10^k), чтобы деления были целыми
  const niceCeil = (value: number) => { const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, value)))); for (const m of [1, 2, 5, 10]) if (m * mag >= value) return m * mag; return 10 * mag; };
  const maxCount = niceCeil(Math.max(...values.map(([, bucket]) => bucket.count), 1)), maxDead = niceCeil(Math.max(...values.map(([, bucket]) => bucket.dead), 1));
  // Разрез по типам (данные есть только он) — горизонтальные пары баров «ДТП/погибшие» как в макете
  if (state.chartMode === "types") {
    bars.className = "bars bars-horizontal";
    bars.replaceChildren(...values.map(([label, bucket]) => {
      const row = document.createElement("div"); row.className = "hrow";
      row.title = `${label}: ${number().format(bucket.count)} ${t("accidents").toLowerCase()}, ${number().format(bucket.dead)} ${t("deaths")}`;
      const name = document.createElement("span"); name.className = "hlabel"; name.textContent = label; name.title = label;
      const count = document.createElement("span"); count.className = "hcount"; count.textContent = number().format(bucket.count);
      const crashTrack = document.createElement("span"); crashTrack.className = "htrack crash";
      const crashBar = document.createElement("i"); crashBar.style.width = `${Math.max(2, Math.round(bucket.count / maxCount * 100))}%`; crashTrack.append(crashBar);
      const dead = document.createElement("span"); dead.className = "hcount"; dead.textContent = number().format(bucket.dead);
      const deadTrack = document.createElement("span"); deadTrack.className = "htrack dead";
      const deadBar = document.createElement("i"); deadBar.style.left = `${Math.round(bucket.dead / maxDead * 100)}%`; deadTrack.append(deadBar);
      row.append(name, count, crashTrack, dead, deadTrack);
      return row;
    }));
    return;
  }
  // Разрезы по времени (когда появятся даты): комбо как на старом сайте — светло-серые
  // скруглённые столбцы по левой оси и красная линия погибших с круглыми маркерами по правой
  bars.className = "bars bars-combo";
  // Ось помещается в панель: шаг колонок 18–52px, сама колонка — примерно половина шага
  const slot = Math.max(18, Math.min(52, Math.floor(((bars.clientWidth || 900) - 92) / values.length)));
  const width = values.length * slot + 92, height = 300, padL = 46, padR = 46, padT = 14, padB = 24, plotW = width - padL - padR, plotH = height - padT - padB;
  const x = (index) => padL + slot * (index + 0.5);
  const colW = Math.max(8, Math.round(slot * 0.52));
  const yCount = (value) => padT + plotH * (1 - value / maxCount), yDead = (value) => padT + plotH * (1 - value / maxDead);
  const tick = (value) => number().format(value);
  const axis = (max, scale, side) => {
    const lines = [], steps = 5;
    for (let step = 0; step <= steps; step++) {
      const value = max / steps * step, y = scale(value);
      lines.push(`<line x1="${side === "l" ? padL : padL + plotW}" y1="${y}" x2="${side === "l" ? padL + plotW : padL + plotW}" y2="${y}" stroke="#e3e9ed"></line>`);
      lines.push(`<text x="${side === "l" ? padL - 8 : padL + plotW + 8}" y="${y + 4}" text-anchor="${side === "l" ? "end" : "start"}" font-size="11" fill="#8296a5">${tick(value)}</text>`);
    }
    return lines.join("");
  };
  const columns = values.map(([, bucket], index) => `<rect x="${x(index) - colW / 2}" y="${yCount(bucket.count)}" width="${colW}" height="${Math.max(2, padT + plotH - yCount(bucket.count))}" rx="4" fill="#e2e6ea"></rect>`).join("");
  const markers = values.map(([, bucket], index) => `<circle cx="${x(index)}" cy="${yDead(bucket.dead)}" r="4.5" fill="#FF001A"></circle>`).join("");
  // Подписи оси X: даты дня — ДД.ММ, месяца — ММ.ГГГГ, часы/годы — как есть;
  // каждая — когда влезает (шаг ≥22px), иначе через одну/через пять, но крайние всегда
  const axisLabel = (key) => state.chartMode === "days" ? `${key.slice(8, 10)}.${key.slice(5, 7)}` : state.chartMode === "months" ? `${key.slice(5, 7)}.${key.slice(0, 4)}` : key;
  const every = slot >= 22 ? 1 : slot >= 11 ? 2 : 5;
  const labels = values.map(([label], index) => index % every === 0 || index === values.length - 1 ? `<text x="${x(index)}" y="${height - 6}" text-anchor="middle" font-size="11" fill="#8296a5">${axisLabel(String(label)).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>` : "").join("");
  bars.replaceChildren(Object.assign(document.createElement("div"), { innerHTML: `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${axis(maxCount, yCount, "l")}${axis(maxDead, yDead, "r")}<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#d1dee4"></line>${columns}${markers}${labels}</svg>` }));
}

const mapQuery = new URLSearchParams(location.search), initialCenter = (mapQuery.get("center") || "").split(":").map(Number), zoomQuery = mapQuery.get("zoom"), initialZoom = zoomQuery === null ? NaN : Number(zoomQuery);
// preferCanvas: десятки тысяч точек рисуются на одном canvas — SVG-рендер на этом вешает вкладку.
// Кнопки +/− не показываем ни на одном клиенте (масштаб колесом/щипком)
const map = L.map("leaflet-map", { zoomControl: false, minZoom: 4, preferCanvas: true }).setView(initialCenter.length === 2 && initialCenter.every(Number.isFinite) ? initialCenter : [55.76, 37.64], Number.isFinite(initialZoom) ? initialZoom : 11);
// Префикс атрибуции по умолчанию содержит флаг (svg) перед «Leaflet» — оставляем просто ссылку
map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>');
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
const accidents = L.layerGroup().addTo(map);
const markers = new Map<string, any>();
const heatSettings = { radius: 6, blur: 9, minOpacity: .05 };
const heatGradient = { 0: "rgba(126, 171, 85, 0)", .2: "rgba(126, 171, 85, 0.6)", .4: "rgba(255, 254, 85, 0.7)", .6: "rgba(245, 193, 66, 0.8)", .8: "rgba(223, 130, 68, 0.9)", 1: "rgba(176, 36, 24, 1)" };
const heat = L.heatLayer([], { ...heatSettings, maxZoom: 12, gradient: heatGradient }).addTo(map);
const yandexHeatSettings = { radius: 15, opacity: .5, intensityOfMidpoint: .5 };
const yandex = { map: null as any, points: null as any, heatCanvas: null as HTMLCanvasElement | null, heatCtx: null as CanvasRenderingContext2D | null, loading: null as Promise<void> };
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
const EMPTY_HEAT: number[][] = [];
// Последний посчитанный срез — к нему переприсовываются слои при смене клиента карты
const lastRender = { visible: [] as any[], heatPoints: EMPTY_HEAT, heatVisible: false };
// Тепловая карта живёт на отдалённом масштабе (регион/город), при приближении
// сменяется точками; точки появляются с зума 13
const heatZoomMax = 13;
// Мгновенная смена режима «тепло/точки» при пересечении порога зума —
// не дожидаясь отложенной догрузки данных
function applyHeatMode() {
  const heatVisible = currentView().zoom < heatZoomMax;
  if (heatVisible !== lastRender.heatVisible) renderMapData(currentView());
}
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
  for (const item of visible) if (!markers.has(item.id)) markers.set(item.id, L.circleMarker([item.point.latitude, item.point.longitude], { radius: 5, weight: 0, fillColor: markerColor(item), fillOpacity: 1 }).bindPopup(markerPopup(item)).addTo(accidents));
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
    placemark.events.add("click", (event) => { event.stopPropagation(); yandex.map.balloon.open(event.get("coords"), { content: markerPopup(item) }, { autoPan: false }); });
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
  map.getSource("dtp-points")?.setData({ type:"FeatureCollection", features: heatVisible ? [] : visible.map((item) => ({ type:"Feature", geometry:{ type:"Point", coordinates:[item.point.longitude, item.point.latitude] }, properties:{ severity:item.severity, popup:markerPopup(item) } })) });
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
  const canvas = document.createElement("canvas");
  canvas.className = "yandex-heat";
  $("#yandex-map").append(canvas);
  yandex.heatCanvas = canvas;
  yandex.heatCtx = canvas.getContext("2d", { willReadFrequently: true });
  renderYandex(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible);
  yandex.map.events.add("boundschange", () => { if (state.mapClient === "yandex") scheduleMapLoad(); });
  // Тепло едет вместе с картой: в жесте полотно догоняет вид transform-сдвигом,
  // перерисовка — по завершении жеста. Живые центр и зум берём из тика события
  // actiontick (публичные tick.globalPixelCenter/tick.zoom): map.getCenter() в ходе
  // жеста отстаёт, а приватные поля action (_zoom, _globalPixelCenter) ненадёжны
  yandex.map.events.add("actiontick", (e: any) => {
    if (state.mapClient !== "yandex") return;
    const anchor = yandexHeatAnchor, canvas = yandex.heatCanvas;
    const tick = e?.originalEvent?.tick;
    if (!anchor || !canvas || canvas.style.display === "none" || !tick?.globalPixelCenter) { applyHeatMode(); return; }
    // Зум-жест (DTP-30): тепло скрывается до конца жеста. Холд не даёт вернуть
    // видимость: если полотно перерисовалось прямо в жесте (якорь перескочил на
    // целевой зум), оставшиеся тики продолжают гасить слой
    if (tick.zoom !== anchor.zoom) { yandexHeatZoomHold = true; canvas.style.opacity = "0"; return; }
    if (yandexHeatZoomHold) { canvas.style.opacity = "0"; return; }
    const [cx, cy] = tick.globalPixelCenter;
    canvas.style.transform = `translate3d(${Math.round(anchor.x - cx)}px, ${Math.round(anchor.y - cy)}px, 0)`;
  });
  yandex.map.events.add("actionend", () => { if (state.mapClient === "yandex") { yandexHeatZoomHold = false; applyHeatMode(); scheduleYandexHeat(); updateYandexPointRadius(); } });
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
    map.on("click", "dtp-points", (event) => new mapboxgl.Popup().setLngLat(event.features[0].geometry.coordinates).setHTML(event.features[0].properties.popup).addTo(map));
    renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible);
  };
  mapbox.map.on("style.load", setup);
  mapbox.map.on("load", setup);
  mapbox.map.on("moveend", () => { if (state.mapClient === "mapbox") scheduleMapLoad(); });
  // На время зум-жеста тепло скрывается (DTP-30), точки остаются видимыми;
  // прозрачность возвращаем по значению слайдера, а не запомненную
  mapbox.map.on("zoomstart", () => { if (state.mapClient !== "mapbox" || mapboxHeatHold || !mapbox.map.getLayer("dtp-heat")) return; mapboxHeatHold = true; mapbox.map.setPaintProperty("dtp-heat", "heatmap-opacity", 0); });
  mapbox.map.on("zoomend", () => { if (state.mapClient !== "mapbox") return; if (mapboxHeatHold) { mapboxHeatHold = false; mapbox.map.setPaintProperty("dtp-heat", "heatmap-opacity", mapboxHeatPaint().opacity); } applyHeatMode(); });
}
function renderMapSwitcher() { document.querySelectorAll("[data-map-client], [data-quick-map]").forEach((button) => button.classList.toggle("active", (button.dataset.mapClient || button.dataset.quickMap) === state.mapClient)); }
async function switchMapClient(client) {
  if (client === state.mapClient) return;
  const view = currentView(); state.mapClient = client; localStorage.setItem("map-client", client); renderMapSwitcher(); renderHeatControls();
  $("#leaflet-map").hidden = client !== "leaflet"; $("#yandex-map").hidden = client !== "yandex"; $("#mapbox-map").hidden = client !== "mapbox";
  if (client === "leaflet") { map.setView([view.center.latitude, view.center.longitude], view.zoom, { animate: false }); map.invalidateSize(); renderLeaflet(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); return; }
  try {
    if (client === "yandex") { await ensureYandex(view); renderYandex(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); }
    else { await ensureMapbox(view); renderMapbox(lastRender.visible, lastRender.heatPoints, lastRender.heatVisible); mapbox.map.resize(); }
  } catch { state.mapClient = "leaflet"; localStorage.setItem("map-client", "leaflet"); $("#yandex-map").hidden = true; $("#mapbox-map").hidden = true; $("#leaflet-map").hidden = false; renderMapSwitcher(); renderHeatControls(); setStatus(t("unavailable")); }
}

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
const popupCache = new WeakMap<object, string>();
function markerPopup(item) {
  const cached = popupCache.get(item);
  if (cached) return cached;
  // Адреса в точках API нет — строку места не выводим вовсе
  const place = item.address || item.street || "";
  const escape = (value) => String(value || "").replace(/[&<>\"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;" })[character]);
  const details = state.language === "en" ? "Accident details" : "Подробности ДТП";
  // Даты в точках API нет — строка с датой просто не выводится
  const day = item.datetime ? intlFormatter("day", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date(item.datetime)) + `, ${item.datetime.slice(11, 16)}` : "";
  const injured = item.injured > 0 ? `<p class="popup-injured">${number().format(item.injured)} ${pluralPeople(item.injured)} ${state.language === "ru" ? (item.injured === 1 && item.injured % 100 !== 11 ? "пострадал" : "пострадали") : item.injured === 1 ? "was injured" : "were injured"}</p>` : "";
  const dead = item.dead > 0 ? `<p class="popup-dead">${number().format(item.dead)} ${pluralPeople(item.dead)} ${state.language === "ru" ? (item.dead % 10 === 1 && item.dead % 100 !== 11 ? "погиб" : "погибло") : item.dead === 1 ? "died" : "died"}</p>` : "";
  const html = `<div class="marker-popup"><strong>${escape(item.category_name)}</strong>${day ? `<span>${escape(day)}</span>` : ""}${place ? `<span>${escape(place)}</span>` : ""}${injured}${dead}<a href="details/?id=${encodeURIComponent(item.id)}&lang=${state.language}">${details}</a></div>`;
  popupCache.set(item, html);
  return html;
}
function dynamicValues(filter) { return filter.key === "street" && !filter.values.length ? [...new Set(state.rawItems.map((item) => item.street).filter(Boolean))].sort().map((value) => ({ value, preview:value })) : filter.values || []; }
let filterReloadTimer: any;
// Живая перезагрузка данных при смене параметров про-фильтров (без кнопки «Применить»);
// для ввода с клавиатуры — с задержкой, для чекбоксов — сразу через loadMapData
function scheduleFilterReload() { clearTimeout(filterReloadTimer); filterReloadTimer = setTimeout(loadMapData, 500); }
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
    jobs.push(fetch(`${api}/dict/${filter.dict}`).then((response) => response.ok ? response.json() : []).then((rows) => {
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
    jobs.push(fetch(`${api}/dict/${filter.dict}?parent_id=${ids.join(",")}`).then((response) => response.ok ? response.json() : []).then((rows) => {
      if (filter.parentSel !== signature) return; // пока грузили, родитель снова сменился — придёт следующий refreshCascade
      filter.loading = false;
      filter.values = (rows || []).map((row) => ({ value:Number(row.id), preview:String(row.name) }));
    }).catch(() => { filter.loading = false; }));
  }
  if (dirty) renderAdvancedFilters(); // сброс/загрузка детей — сразу перерисовываем (хинты, «загружаем»)
  if (jobs.length) { await Promise.all(jobs); renderAdvancedFilters(); }
}
function renderAdvancedFilters() {
  const root = $("#advanced-dynamic");
  // Живая перезагрузка данных пересобирает панель — сохраняем раскрытые секции, поисковые запросы и фокус ввода
  const previous = new Map();
  for (const section of root.querySelectorAll(".advanced-collapse")) previous.set(section.dataset.label, { open: section.open, query: section.querySelector(".advanced-search")?.value ?? "" });
  const active = document.activeElement;
  let restore: { label: string; row?: string; input?: number; search?: boolean } | null = null;
  if (active instanceof HTMLInputElement) {
    const section = active.closest(".advanced-collapse"), row = active.closest(".advanced-interval");
    if (section) restore = row
      ? { label: (section as HTMLElement).dataset.label ?? "", row: row.querySelector("span")?.textContent ?? "", input: [...row.querySelectorAll("input")].indexOf(active) }
      : { label: (section as HTMLElement).dataset.label ?? "", search: active.classList.contains("advanced-search") };
  }
  const sections = state.filters.filter((filter) => filter.param).map((filter) => {
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
      options.textContent = filter.loading ? t("loading") : t(parent === "REGION" ? "pickRegion" : parent === "PLACE" ? "pickPlace" : "pickMark");
      section.append(title, options); return section;
    }
    const search = filter.key === "street" || filter.values.length > 8 ? document.createElement("input") : null;
    if (search) { search.type = "search"; search.placeholder = t("search"); search.className = "advanced-search"; if (saved?.query) search.value = saved.query; }
    options.className = "advanced-options";
    const draw = () => { const query = search ? search.value.trim().toLowerCase() : "", selected = state.selectedFilters[key] || []; options.replaceChildren(...dynamicValues(filter).filter((item) => item.preview.toLowerCase().includes(query)).map((item) => { const label = document.createElement("label"), input = document.createElement("input"); if (item.ui_tone) label.className = `filter-tone ${item.ui_tone}`; input.type = "checkbox"; input.checked = selected.includes(item.value); input.addEventListener("change", () => { const values = new Set(state.selectedFilters[key] || []); input.checked ? values.add(item.value) : values.delete(item.value); state.selectedFilters[key] = [...values]; loadMapData(); refreshCascade(); }); label.append(input, document.createTextNode(item.preview)); return label; })); };
    title.append(name);
    if (search) { search.addEventListener("input", draw); search.addEventListener("keydown", (event) => event.stopPropagation()); section.append(title, search, options); }
    else section.append(title, options);
    draw(); return section;
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
  const input = $("#advanced-region") as HTMLInputElement;
  input.value = state.territory ? state.territory.name : "";
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
  if (!query) { state.territory = null; updateTerritoryCard(); suggest.hidden = true; refreshCascade(); loadMapData(); return; }
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
// Выбранные участники → набор видов ДТП (приближение по em_type_id); null — без клиентского фильтра.
// Мультивыбор участников объединяется по ИЛИ: виды всех выбранных собираются в Set —
// «Пешеходы»+«Велосипедисты» = ДТП вида 1 ИЛИ 8. «Все участники» и пустой выбор
// ограничения не накладывают. Участники без emTypes («Дети», «Мотоциклисты»,
// «Общ. транспорт») фильтруются серверно в serverQuery — маской или типами ТС,
// но только если выбраны без клиентов-участников
function participantEmTypes() {
  const selected = selectedParticipants();
  if (!selected.length || selected.includes(1)) return null;
  const set = new Set();
  for (const value of selected) for (const em of participantConfig[value]?.emTypes || []) set.add(em);
  return set.size ? [...set] : null;
}
// Выбранные участники → объединённый список типов ТС («Мотоциклисты»/«Общ. транспорт»);
// null — серверный параметр не шлём. Как и у emTypes: «Все участники», пустой выбор
// или примесь участников других механизмов (маска «Дети», клиентские виды ДТП) отключают его —
// И разных механизмов на бэкенде невыразимо в ИЛИ
function participantProdTypeIds() {
  const selected = selectedParticipants();
  if (!selected.length || selected.includes(1)) return null;
  const set = new Set();
  for (const value of selected) {
    if (participantConfig[value]?.emTypes || participantConfig[value]?.mask) return null;
    for (const id of participantConfig[value]?.prodTypes || []) set.add(id);
  }
  return set.size ? [...set] : null;
}
// Ключ эффективной выборки участников: emTypes + серверные маски + серверные типы ТС.
// Изменение любого слагаемого меняет серверный запрос — точки надо перезагрузить
function participantFilterKey() {
  const masks = [];
  for (const item of state.participants) { const mask = item.selected && participantConfig[item.value]?.mask; if (mask) masks.push(mask.param); }
  return JSON.stringify([participantEmTypes(), masks, participantProdTypeIds()]);
}
const regionShapes = fetch("assets/regions.geojson").then((response) => response.ok ? response.json() : Promise.reject(new Error("Region boundaries unavailable")));
function inRing(point, ring) { let inside = false; for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) { const [x, y] = ring[index], [px, py] = ring[previous]; if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside; } return inside; }
// Рамка для запроса точек: в полтора раза шире видимой области, чтобы панорамирование
// в её пределах обходилось без новых запросов. Ключ рамки округляется до 0.001° (~100 м),
// чтобы микродвижения карты не порождали новые наборы в кэше.
type MapFrame = Bounds & { key: string; covers: (view: Bounds) => boolean };
let loadedFrame: MapFrame | null = null;
function viewFrame(bounds: Bounds): MapFrame {
  const dx = (bounds.east - bounds.west) / 2, dy = (bounds.north - bounds.south) / 2, round = (value: number) => Math.round(value * 1000) / 1000;
  const frame = { west: round(bounds.west - dx), east: round(bounds.east + dx), south: round(bounds.south - dy), north: round(bounds.north + dy) };
  return { ...frame, key: `${frame.south},${frame.west},${frame.north},${frame.east}`, covers: (view: Bounds) => view.west >= frame.west && view.east <= frame.east && view.south >= frame.south && view.north <= frame.north };
}
// Фолбэк для бэкенда без LATITUDE/LONGITUDE: регион под центром видимой области.
// Внутренние кольца (дырки) учитываем, из содержащих регионов выбираем наименьший —
// иначе Москва попадёт во внешнее кольцо Московской области
async function regionAtCenter(bounds: Bounds) {
  const data = await regionShapes, x = (bounds.west + bounds.east) / 2, y = (bounds.south + bounds.north) / 2, point = [x, y];
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

// Индекс регионов для поиска по названию (id совпадают с regions.geojson и REGION API)
const regionIndex: { id: number; name: string; lower: string }[] = [];
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
  loadMapData();
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
// Прямая ссылка на конкретное ДТП открывает его попап (?popup=<em_number>).
// Единожды: при первом рендере, где точка уже загружена — иначе попап
// пересоздавался бы на каждый сдвиг карты
let linkedPopupPending = Boolean(mapQuery.get("popup"));
function openLinkedPopup() {
  const popupId = mapQuery.get("popup");
  if (!popupId) return true;
  if (state.mapClient === "leaflet") {
    const marker = markers.get(popupId);
    if (!marker) return false;
    marker.openPopup();
    return true;
  }
  const item = lastRender.visible.find((candidate) => candidate.id === popupId);
  if (!item) return false;
  if (state.mapClient === "yandex" && yandex.map) {
    yandex.map.balloon.open([item.point.longitude, item.point.latitude], { content: markerPopup(item) }, { autoPan: false });
    return true;
  }
  if (state.mapClient === "mapbox" && mapbox.map && (window as any).mapboxgl) {
    new (window as any).mapboxgl.Popup().setLngLat([item.point.longitude, item.point.latitude]).setHTML(markerPopup(item)).addTo(mapbox.map);
    return true;
  }
  return false;
}
function renderMapData(view) {
  const filtered = filteredPoints(), visible = [];
  for (const item of filtered) if (contains(view.bounds, item.point)) visible.push(item);
  // При закреплённой территории счётчики считаются по всей территории, а не по видимой области
  const counted = state.territory ? filtered : visible;
  state.items = counted;
  $("#count").textContent = number().format(counted.length);
  $("#injured").textContent = number().format(counted.reduce((sum, item) => sum + Number(item.injured || 0), 0));
  $("#dead").textContent = number().format(counted.reduce((sum, item) => sum + Number(item.dead || 0), 0));
  if (!$("#chart").hidden) renderChart();
  // На отдалении плотность читается только теплом (точек сотни тысяч), вблизи —
  // точки-маркеры: поверх точек плотность не читается
  const heatVisible = view.zoom < heatZoomMax;
  const heatPoints = heatVisible ? heatInView(filtered, view) : EMPTY_HEAT;
  // Слои переприсовываются только у активного клиента — остальные догонят при переключении
  Object.assign(lastRender, { visible, heatPoints, heatVisible });
  renderHeatControls();
  if (state.mapClient === "leaflet") renderLeaflet(visible, heatPoints, heatVisible);
  else if (state.mapClient === "yandex") renderYandex(visible, heatPoints, heatVisible);
  else renderMapbox(visible, heatPoints, heatVisible);
  if (linkedPopupPending) linkedPopupPending = !openLinkedPopup();
  setStatus(`${number().format(counted.length)} ${(state.territory ? t("accidents") : t("accidentsInArea")).toLowerCase()}`);
}

async function loadMapData() {
  const { start, end } = period();
  if (!start || !end || end < start) return;
  state.abort?.abort();
  const controller = state.abort = new AbortController(), loadId = ++state.dataLoadId, view = currentView();
  setStatus(t("loadingMap"));
  try {
    const server = serverQuery();
    const bucketKey = `${start}|${end}|${server.toString()}`;
    // Держим один активный бакет: смена периода/серверных фильтров даёт новый ключ
    if (!regionCache.has(bucketKey)) { regionCache.clear(); loadedFrame = null; }
    const bucket = regionCache.get(bucketKey) ?? new Map<string, any[]>();
    regionCache.set(bucketKey, bucket);
    // Два режима загрузки точек:
    // 1) без закреплённой территории — рамка карты (точка + масштаб), параметрами LATITUDE/LONGITUDE;
    // 2) закреплён регион и/или место — только эти точки, параметром REGION.
    const frame = !state.territory && loadedFrame?.covers(view.bounds) ? loadedFrame : viewFrame(view.bounds);
    const cacheKey = state.territory ? String(state.territory.id) : frame.key;
    if (!bucket.has(cacheKey)) {
      $("#chart-period").textContent = `${t("forPeriod")}: ${start} — ${end}`;
      // Бэкенд ещё не умеет рамку (в /dtp/filter_fields нет LATITUDE) — режим карты
      // деградирует в регион под центром видимой области
      const fallback = !state.territory && !state.bboxSupported ? await regionAtCenter(view.bounds) : null;
      if (state.dataLoadId !== loadId) return;
      // Весь период одним запросом — бэкенд с ним справляется
      const query = new URLSearchParams({ DATE_TIME_FROM:`${start}T00:00:00`, DATE_TIME_TO:`${end}T23:59:59` });
      const regionId = state.territory ? state.territory.id : fallback;
      if (regionId !== null) query.set("REGION", String(regionId));
      else if (state.bboxSupported) {
        query.set("LATITUDE_FROM", String(frame.south)); query.set("LATITUDE_TO", String(frame.north));
        query.set("LONGITUDE_FROM", String(frame.west)); query.set("LONGITUDE_TO", String(frame.east));
      } else { bucket.set(cacheKey, []); } // видимая область вне регионов РФ
      if (!bucket.has(cacheKey)) {
        server.forEach((value, key) => query.append(key, value));
        const response = await fetch(`${api}/dtp/points?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("API unavailable");
        bucket.set(cacheKey, pointItems(await response.json()));
      }
      if (state.dataLoadId !== loadId) return;
      if (!state.territory) loadedFrame = frame;
      renderAdvancedFilters();
    }
    // Пересобираем rawItems только когда набор реально изменился
    const mergedKey = `${bucketKey}|${cacheKey}`;
    if (state.rawItemsKey !== mergedKey) {
      state.rawItemsKey = mergedKey;
      state.rawItems = bucket.get(cacheKey) ?? [];
    }
    renderMapData(view);
  } catch (error) {
    if (error.name !== "AbortError") setStatus(t("unavailable"));
  }
}

async function loadFilters() {
  try {
    const fieldsResponse = await fetch(`${api}/dtp/filter_fields`);
    if (!fieldsResponse.ok) throw new Error("API unavailable");
    // Секции проф-фильтра: EM_TYPE фильтруется на клиенте (поле em_type_id есть в точках),
    // серверные секции (serverSections) уходят параметрами в /dtp/points
    const fields = await fieldsResponse.json(), advancedFields = fields.filter((field) => field.name === "EM_TYPE" || serverSections.includes(field.name));
    // Рамка видимой области доступна, только если бэкенд знает LATITUDE/LONGITUDE
    state.bboxSupported = fields.some((field) => field.name === "LATITUDE");
    const dictionaries = await Promise.all(advancedFields.map(async (field) => {
      // Словари грузятся лениво: секции — при открытии про-панели (loadLazyDicts),
      // каскадные (PLACE/ROAD/STREET/NP/MODEL) — по выбору родителя (refreshCascade).
      // Исключение — EM_TYPE: его имена нужны сразу для попапов и категорий
      if (field.name !== "EM_TYPE") return [field, []];
      const response = await fetch(`${api}/dict/${field.dict}`);
      return [field, response.ok ? await response.json() : []];
    }));
    // В emTypeNames идут только виды ДТП: id других словарей пересекаются и сломают попапы
    for (const [field, values] of dictionaries) if (field.name === "EM_TYPE") for (const value of values) emTypeNames.set(Number(value.id), value.name);
    const end = new Date(dataRange.max), start = new Date(end); start.setDate(1); start.setMonth(start.getMonth() - 11);
    $("#start-date").value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`; $("#end-date").value = dataRange.max; state.minDate = dataRange.min; state.maxDate = dataRange.max;
    state.filters = enrichFilters([
      { name:"participant_categories", values:[
        { preview:"Все участники", value:1, default:true },
        { preview:"Пешеходы", value:2 },
        { preview:"Велосипедисты", value:3 },
        { preview:"Мотоциклисты", value:4 },
        { preview:"Общ. транспорт", value:5 },
        { preview:"Дети", value:6 },
      ] },
      { name:"severity", values:[{ preview:"Без пострадавших", value:0, ui_tone:"none" }, { preview:"Лёгкий", value:1, ui_tone:"light" }, { preview:"Тяжёлый", value:3, ui_tone:"serious" }, { preview:"С погибшими", value:4, ui_tone:"fatal" }] },
      ...dictionaries.map(([field, values]) => ({ name:field.name, key:field.name === "EM_TYPE" ? "category" : field.name, param:`${field.name}_IDS`, dict:field.dict, label:t(serverSectionLabels[field.name]) || field.caption, values:values.map((value) => ({ value:value.id, preview:value.name })) })),
      { name:"masks", key:"masks", param:"masks", label:t("signs"), values:maskFeatures.map(({ value, preview }) => ({ value, preview })) },
      { name:"intervals", key:"intervals", param:"intervals", label:t("quantity"), values:intervalFields },
    ]);
    state.participants = (state.filters.find((filter) => filter.name === "participant_categories")?.values || []).map((participant) => ({ ...participant, selected: Boolean(participant.default) }));
    fetch(`${api}/dict/regions`).then((response) => response.ok ? response.json() : []).then((rows) => {
      for (const row of rows || []) if (row?.name && row.id !== 1) regionIndex.push({ id:Number(row.id), name:String(row.name), lower:String(row.name).toLowerCase() });
      // Прямая ссылка на территорию (?region=<id>) — закрепляем её и центрируем карту
      const regionId = Number(mapQuery.get("region"));
      if (Number.isFinite(regionId) && regionId > 0) selectRegion(regionIndex.find((region) => region.id === regionId) || { id:regionId, name:String(regionId) });
    }).catch(() => {});
    applyLanguage();
    updateTerritoryCard();
    // Прямая ссылка на территорию (?region=<id>) закрепляет её и сама грузит точки —
    // стартовая загрузка по рамке тут не нужна, selectRegion вызовет loadMapData
    if (!mapQuery.get("region")) loadMapData();
  } catch { setStatus(t("unavailable")); }
}

const reload = () => loadMapData();
$("#start-date").addEventListener("change", reload);
$("#end-date").addEventListener("change", reload);
$("#date-range-button").addEventListener("click", (event) => openDateMenu(event.currentTarget as Element));
$("#advanced-date-range-button").addEventListener("click", (event) => openDateMenu(event.currentTarget as Element));
// Поле периода: текст редактируется напрямую (маска + применение по Enter/потере фокуса), дропдаун пресетов — только по стрелке
document.querySelectorAll("#date-range-value, #advanced-date-range-value").forEach((node) => {
  const input = node as HTMLInputElement;
  input.addEventListener("input", () => { input.value = maskRangeDigits(input.value.replace(/\D/g, "").slice(0, 16)); });
  input.addEventListener("blur", () => applyRangeInput(input));
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
});
// Регион про-панели: подсказки на ввод, Enter — выбор первого совпадения, пустой ввод — сброс (DTP-25)
$("#advanced-region").addEventListener("input", drawAdvancedRegionSuggest);
$("#advanced-region").addEventListener("focus", drawAdvancedRegionSuggest);
$("#advanced-region").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); advancedRegionCommit(); }
  if (event.key === "Escape") { syncAdvancedRegion(); ($("#region-suggest-adv") as HTMLElement).hidden = true; }
  event.stopPropagation();
});
$("#advanced-region").addEventListener("blur", () => setTimeout(() => { ($("#region-suggest-adv") as HTMLElement).hidden = true; }, 150));
document.querySelectorAll('input[name="severity"]').forEach((input) => input.addEventListener("change", reload));
$("#close-advanced").addEventListener("click", () => setAdvancedCollapsed(!document.body.classList.contains("advanced-collapsed")));
$("#back-to-basic").addEventListener("click", closeAdvanced);
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
$("#hide-filters").addEventListener("click", () => setFiltersCollapsed(!$("#filters").classList.contains("collapsed")));
if (matchMedia("(max-width: 800px)").matches) setFiltersCollapsed(true);
$("#professional-toggle").addEventListener("click", openAdvanced);
$("#region-search").addEventListener("input", drawRegionSuggest);
$("#region-search").addEventListener("focus", drawRegionSuggest);
$("#lock-button").addEventListener("click", () => { if (!state.territory) return; state.territory = null; updateTerritoryCard(); refreshCascade(); loadMapData(); });
document.addEventListener("click", (event) => {
  const target = event.target as Element;
  if (!target.closest(".region-search")) $("#region-suggest").hidden = true;
  if (!target.closest("#date-menu") && !target.closest("#date-range-button") && !target.closest("#advanced-date-range-button") && !$("#date-menu").hidden) closeDateMenu();
});
document.querySelectorAll("[data-quick-map]").forEach((button) => button.addEventListener("click", () => switchMapClient(button.dataset.quickMap as "leaflet" | "yandex" | "mapbox")));
$("#chart-button").addEventListener("click", () => {
  // По дням/часам без дат построить нечего — сразу открываем доступный разрез «По типам»
  if (state.chartMode !== "types" && (!chartDatesAvailable() || chartAxis(state.chartMode) === null)) setChartMode("types");
  $("#chart").hidden = false; renderChart();
});
$("#close-chart").addEventListener("click", () => { $("#chart").hidden = true; });
$("#download-button").addEventListener("click", downloadData);
$("#chart-side").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  // Отключённые дни/часы не кликабельны — защита от программного клика
  if (!button || button.disabled) return;
  setChartMode(button.dataset.mode);
  renderChart();
});
// «Скачать данные» выгружает то, что выбрано фильтрами (все загруженные точки текущего
// набора), как GeoJSON — без перехода на другую страницу
function downloadData() {
  const items = filteredPoints(), { start, end } = period();
  const features = items.map((item) => ({ type:"Feature", geometry:{ type:"Point", coordinates:[item.point.longitude, item.point.latitude] }, properties:{ em_number:item.id, date_time:item.datetime, em_type_id:item.category, em_type:item.category_name, hv_category:item.severity, participants:item.participants, injured:item.injured, dead:item.dead } }));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ type:"FeatureCollection", features })], { type:"application/geo+json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `dtpstat_${start}_${end}.geojson`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus(`${t("data")}: GeoJSON, ${number().format(items.length)} ${t("accidents").toLowerCase()}`);
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
document.querySelectorAll("#heat-controls input").forEach((input) => input.addEventListener("input", updateHeatControls));
let moveTimer;
function scheduleMapLoad() { clearTimeout(moveTimer); state.abort?.abort(); state.dataLoadId++; moveTimer = setTimeout(loadMapData, 350); }
map.on("moveend", () => { if (state.mapClient === "leaflet") scheduleMapLoad(); });
// На время зум-жеста тепло скрывается классом heat-hold (DTP-30):
// канвас листлета тянется трансформом панели и выглядит «плывущим»
map.on("zoomstart", () => map.getContainer().classList.add("heat-hold"));
map.on("zoomend", () => { if (state.mapClient !== "leaflet") return; map.getContainer().classList.remove("heat-hold"); applyHeatMode(); });
applyLanguage();
const savedMapClient = state.mapClient; state.mapClient = "leaflet"; renderMapSwitcher(); if (savedMapClient !== "leaflet") switchMapClient(savedMapClient);
loadFilters();
