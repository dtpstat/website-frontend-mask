// Конвейер данных: renderMapData/loadMapData/loadFilters, гейт дэшборда, режим тепло/точки

import { $, state, api, apiFetch, regionCache, dataRange, emTypeNames, lastRender, regionIndex, regionName, EMPTY_HEAT, setStatus, actions, mapQuery } from "./context.js";
import { t, number } from "./i18n.js";
import { period } from "./dates.js";
import { serverQuery, renderAdvancedFilters, refreshCascade, enrichFilters, filteredPoints, serverSections, serverSectionLabels, maskFeatures, intervalFields } from "./filters.js";
import { regionAtCenter, applyPlace, updateTerritoryCard, selectRegion, syncRegionFields } from "./territory.js";
import { pointItems, contains } from "./popups.js";
import { renderLeaflet, renderYandex, renderMapbox, renderHeatControls, currentView, heatZoomMax, heatInView } from "./maps.js";
import { consumeLinkedPopup } from "./deeplink.js";
import { renderChart } from "./chart.js";

// Ниже зума 6 территория не определяется (minZoomForHeatmap старого сайта), вне субъектов
// РФ её тоже нет: карточка «Статистика» и график скрыты целиком. Глобальный [hidden] с
// !important (styles.css) бьёт все репозиции карточки; закреплённая территория гейт не проходит
const dashboardMinZoom = 6;
function applyDashboardGate() {
  const hidden = !state.territory && (currentView().zoom < dashboardMinZoom || state.outsideRegions);
  $("#statistics").hidden = hidden;
  $("#chart").hidden = hidden || !state.chartOpen;
}
// Мгновенная смена режима «тепло/точки» при пересечении порога зума —
// не дожидаясь отложенной догрузки данных; заодно применяется гейт дэшборда
function applyHeatMode() {
  const heatVisible = currentView().zoom < heatZoomMax;
  if (heatVisible !== lastRender.heatVisible) renderMapData(currentView());
  applyDashboardGate();
}
function renderMapData(view) {
  const filtered = filteredPoints(), visible = [];
  for (const item of filtered) if (contains(view.bounds, item.point)) visible.push(item);
  state.items = filtered;
  // Счётчики и график — по месту из карточки (округ/район под центром), пока оно не
  // определено — по территории данных (субъект под центром или закреплённый регион);
  // пан внутри территории их не меняет. Слои остаются viewport-клипом региона
  const counted = applyPlace(filtered);
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
  consumeLinkedPopup();
  // Заголовок карточки называет то, что посчитано, — место счётчиков; когда места нет
  // (подпись скрыта или ещё едет) — субъект данных. Второй строкой серым уезжает регион
  // данных (округ/район — часть субъекта), родитель-страна с уровня подписи — третья
  const name = state.place?.name ?? state.territory?.name ?? regionName(state.dataRegion);
  $("#region-name").textContent = name || t("allRegions");
  const region = state.territory?.name ?? regionName(state.dataRegion);
  const plateNode = ($("#region-plate") as HTMLElement);
  plateNode.textContent = region || "";
  plateNode.hidden = !state.place || !region || region === name;
  setStatus(`${number().format(counted.length)} ${t("accidents").toLowerCase()}${name ? ` — ${name}` : ""}`);
}
// Перерисовка текущим видом: место из карточки доехало позже данных (geom отвечает
// медленнее точек) — счётчики и график пересчитываются без нового запроса
function refreshRender() {
  applyDashboardGate();
  renderMapData(currentView());
}

async function loadMapData() {
  const { start, end } = period();
  if (!start || !end || end < start) return;
  // Ниже зума дэшборда данных нет и карточка скрыта — запрос не нужен
  if (!state.territory && currentView().zoom < dashboardMinZoom) { applyDashboardGate(); return; }
  state.abort?.abort();
  const controller = state.abort = new AbortController(), loadId = ++state.dataLoadId, view = currentView();
  setStatus(t("loadingMap"));
  try {
    const server = serverQuery();
    const bucketKey = `${start}|${end}|${server.toString()}`;
    // Держим один активный бакет: смена периода/серверных фильтров даёт новый ключ
    if (!regionCache.has(bucketKey)) regionCache.clear();
    const bucket = regionCache.get(bucketKey) ?? new Map<string, any[]>();
    regionCache.set(bucketKey, bucket);
    // Единственный режим загрузки: REGION = закреплённая территория или субъект под
    // центром (полигоны regions.geojson, их id = параметру REGION). Кэш по региону:
    // пан внутри региона — ноль запросов, переезд в соседний — ровно один.
    // Весь период одним запросом — бэкенд с ним справляется
    const regionId = state.territory ? state.territory.id : await regionAtCenter(view.center.latitude, view.center.longitude);
    if (state.dataLoadId !== loadId) return;
    const cacheKey = String(regionId ?? "none");
    state.dataRegion = regionId;
    state.outsideRegions = regionId === null;
    syncRegionFields(); // регион под центром сменился — поле «Регион» переезжает вместе с картой
    // Каскад «Место ДТП» живёт под тем же эффективным регионом: смена региона данных
    // перезагружает его словарь и сбрасывает устаревший выбор (как при смене замка).
    // На неизменном регионе — дешёвый no-op по подписям; наружу не ждём
    refreshCascade();
    if (!bucket.has(cacheKey)) {
      $("#chart-period").textContent = `${t("forPeriod")}: ${start} — ${end}`;
      const query = new URLSearchParams({ DATE_TIME_FROM:`${start}T00:00:00`, DATE_TIME_TO:`${end}T23:59:59` });
      if (regionId === null) bucket.set(cacheKey, []); // центр вне субъектов РФ — запрос не нужен
      if (!bucket.has(cacheKey)) {
        query.set("REGION", cacheKey);
        server.forEach((value, key) => query.append(key, value));
        const response = await apiFetch(`${api}/dtp/points?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("API unavailable");
        bucket.set(cacheKey, pointItems(await response.json()));
      }
      if (state.dataLoadId !== loadId) return;
      renderAdvancedFilters();
    }
    // Пересобираем rawItems только когда набор реально изменился; место подписи —
    // география и смену набора переживает (см. applyRegion в geom.ts)
    const mergedKey = `${bucketKey}|${cacheKey}`;
    if (state.rawItemsKey !== mergedKey) {
      state.rawItemsKey = mergedKey;
      state.rawItems = bucket.get(cacheKey) ?? [];
    }
    applyDashboardGate();
    renderMapData(view);
  } catch (error) {
    if (error.name !== "AbortError") setStatus(t("unavailable"));
  }
}

async function loadFilters() {
  try {
    const fieldsResponse = await apiFetch(`${api}/dtp/filter_fields`);
    if (!fieldsResponse.ok) throw new Error("API unavailable");
    // Секции проф-фильтра: EM_TYPE фильтруется на клиенте (поле em_type_id есть в точках),
    // серверные секции (serverSections) уходят параметрами в /dtp/points
    const fields = await fieldsResponse.json(), advancedFields = fields.filter((field) => field.name === "EM_TYPE" || serverSections.includes(field.name));
    const dictionaries = await Promise.all(advancedFields.map(async (field) => {
      // Словари грузятся лениво: секции — при открытии про-панели (loadLazyDicts),
      // каскадные (PLACE/ROAD/STREET/NP/MODEL) — по выбору родителя (refreshCascade).
      // Исключение — EM_TYPE: его имена нужны сразу для попапов и категорий
      if (field.name !== "EM_TYPE") return [field, []];
      const response = await apiFetch(`${api}/dict/${field.dict}`);
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
    // Индекс регионов ждём до первой отрисовки: имя субъекта нужно статусу и заголовку графика
    const rows = await apiFetch(`${api}/dict/regions`).then((response) => response.ok ? response.json() : []).catch(() => []);
    for (const row of rows || []) if (row?.name && row.id !== 1) regionIndex.push({ id:Number(row.id), name:String(row.name), lower:String(row.name).toLowerCase() });
    actions.applyLanguage();
    updateTerritoryCard();
    applyDashboardGate(); // прямая ссылка с ?zoom=<малый> открывает карту без дэшборда
    // Прямая ссылка на территорию (?region=<id>) закрепляет её и сама грузит точки —
    // стартовая загрузка тут не нужна, selectRegion вызовет loadMapData
    const regionId = Number(mapQuery.get("region"));
    if (Number.isFinite(regionId) && regionId > 0) selectRegion(regionIndex.find((region) => region.id === regionId) || { id:regionId, name:String(regionId) });
    else loadMapData();
  } catch { setStatus(t("unavailable")); }
}

export { loadMapData, loadFilters, applyHeatMode, refreshRender };
