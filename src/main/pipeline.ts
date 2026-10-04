// Конвейер данных: renderMapData/loadMapData/loadFilters, рамка загрузки, режим тепло/точки

import { $, state, api, apiFetch, regionCache, dataRange, emTypeNames, lastRender, regionIndex, EMPTY_HEAT, setStatus, actions, mapQuery, type Bounds } from "./context.js";
import { t, number } from "./i18n.js";
import { period } from "./dates.js";
import { serverQuery, renderAdvancedFilters, enrichFilters, filteredPoints, serverSections, serverSectionLabels, maskFeatures, intervalFields } from "./filters.js";
import { regionAtCenter, updateTerritoryCard, selectRegion } from "./territory.js";
import { pointItems, contains } from "./popups.js";
import { renderLeaflet, renderYandex, renderMapbox, renderHeatControls, currentView, heatZoomMax, heatInView } from "./maps.js";
import { consumeLinkedPopup } from "./deeplink.js";
import { renderChart } from "./chart.js";

// Мгновенная смена режима «тепло/точки» при пересечении порога зума —
// не дожидаясь отложенной догрузки данных
function applyHeatMode() {
  const heatVisible = currentView().zoom < heatZoomMax;
  if (heatVisible !== lastRender.heatVisible) renderMapData(currentView());
}
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
  consumeLinkedPopup();
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
        const response = await apiFetch(`${api}/dtp/points?${query}`, { signal: controller.signal });
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
    const fieldsResponse = await apiFetch(`${api}/dtp/filter_fields`);
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
    apiFetch(`${api}/dict/regions`).then((response) => response.ok ? response.json() : []).then((rows) => {
      for (const row of rows || []) if (row?.name && row.id !== 1) regionIndex.push({ id:Number(row.id), name:String(row.name), lower:String(row.name).toLowerCase() });
      // Прямая ссылка на территорию (?region=<id>) — закрепляем её и центрируем карту
      const regionId = Number(mapQuery.get("region"));
      if (Number.isFinite(regionId) && regionId > 0) selectRegion(regionIndex.find((region) => region.id === regionId) || { id:regionId, name:String(regionId) });
    }).catch(() => {});
    actions.applyLanguage();
    updateTerritoryCard();
    // Прямая ссылка на территорию (?region=<id>) закрепляет её и сама грузит точки —
    // стартовая загрузка по рамке тут не нужна, selectRegion вызовет loadMapData
    if (!mapQuery.get("region")) loadMapData();
  } catch { setStatus(t("unavailable")); }
}

export { loadMapData, loadFilters, applyHeatMode };
