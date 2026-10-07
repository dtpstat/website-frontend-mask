// Точка входа: заполнение actions, подписки на события, стартовая загрузка

import { $, state, actions, setStatus, regionName } from "./context.js";
import { t, number } from "./i18n.js";
import { period, renderDateFields, closeDateMenu, openDateMenu, blurDateRange } from "./dates.js";
import { renderParticipants, renderAdvancedControls } from "./participants.js";
import { refreshCascade, renderAdvancedFilters, openAdvanced, syncAdvancedRegion, drawAdvancedRegionSuggest, advancedRegionCommit, closeAdvanced, setAdvancedCollapsed, setFiltersCollapsed, filteredPoints } from "./filters.js";
import { map, renderMapSwitcher, switchMapClient, renderHeatControls, updateHeatControls } from "./maps.js";
import { updateTerritoryCard, drawRegionSuggest, syncRegionFields } from "./territory.js";
import { renderChart, setChartMode, chartAxis, chartDatesAvailable } from "./chart.js";
import { loadMapData, loadFilters, applyHeatMode, refreshRender } from "./pipeline.js";
import { scheduleRegionLookup } from "./geom.js";

// Реестр восходящих вызовов заполняется до boot: подписки ниже по файлу начинают
// стрелять только после этого, так что колбэки ранних модулей всегда видят значения
Object.assign(actions, { loadMapData, refreshCascade, applyLanguage, scheduleMapLoad, applyHeatMode, refreshRender, scheduleRegionLookup });

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

const reload = () => loadMapData();
$("#start-date").addEventListener("change", reload);
$("#end-date").addEventListener("change", reload);
$("#date-range-button").addEventListener("click", (event) => openDateMenu(event.currentTarget as Element));
$("#advanced-date-range-button").addEventListener("click", (event) => openDateMenu(event.currentTarget as Element));
// Поля периода: 6 сегментов на панель. Ввод только цифры, автопереход вперёд по
// заполнении, Backspace на пустом — к предыдущему, стрелки — соседний сегмент,
// фокус выделяет содержимое целиком (печатать можно сразу поверх). Период применяется
// при завершении правки (Enter/уход из панели) — как раньше; дропдаун пресетов — по стрелке
document.querySelectorAll(".date-range").forEach((node) => {
  const range = node as HTMLElement;
  const inputs = [...range.querySelectorAll<HTMLInputElement>("[data-date-seg]")];
  inputs.forEach((input, index) => {
    // Клик по пустому сегменту: гасим расстановку курсора (она схлопывает выделение) и выделяем всё
    input.addEventListener("mousedown", (event) => { if (document.activeElement !== input) event.preventDefault(); input.focus(); });
    input.addEventListener("focus", () => input.select());
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength);
      if (input.value.length === input.maxLength && index < inputs.length - 1) inputs[index + 1].focus();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { input.blur(); return; }
      const back = event.key === "Backspace" && !input.value, prev = event.key === "ArrowLeft", next = event.key === "ArrowRight";
      if (!back && !prev && !next) return;
      event.preventDefault();
      const target = back || prev ? index - 1 : index + 1;
      if (target >= 0 && target < inputs.length) inputs[target].focus();
    });
  });
  range.addEventListener("focusout", (event) => { if (!range.contains((event as FocusEvent).relatedTarget as Node)) blurDateRange(range); });
});
// Регион про-панели: подсказки на ввод, Enter — выбор первого совпадения, пустой ввод — сброс (DTP-25)
$("#advanced-region").addEventListener("input", drawAdvancedRegionSuggest);
// Как и в стандартной панели: на фокусе очищаем показанный регион — поле для ввода
$("#advanced-region").addEventListener("focus", () => { ($("#advanced-region") as HTMLInputElement).value = ""; drawAdvancedRegionSuggest(); });
$("#advanced-region").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); advancedRegionCommit(); }
  if (event.key === "Escape") { syncAdvancedRegion(); ($("#region-suggest-adv") as HTMLElement).hidden = true; }
  event.stopPropagation();
});
$("#advanced-region").addEventListener("blur", () => setTimeout(() => { ($("#region-suggest-adv") as HTMLElement).hidden = true; syncRegionFields(); }, 150));
document.querySelectorAll('input[name="severity"]').forEach((input) => input.addEventListener("change", reload));
$("#close-advanced").addEventListener("click", () => setAdvancedCollapsed(!document.body.classList.contains("advanced-collapsed")));
$("#back-to-basic").addEventListener("click", closeAdvanced);
$("#hide-filters").addEventListener("click", () => setFiltersCollapsed(!$("#filters").classList.contains("collapsed")));
if (matchMedia("(max-width: 800px)").matches) setFiltersCollapsed(true);
$("#professional-toggle").addEventListener("click", openAdvanced);
$("#region-search").addEventListener("input", drawRegionSuggest);
// Сфокусированное поле отдано пользователю: показанный регион мешал бы вводу
$("#region-search").addEventListener("focus", () => { ($("#region-search") as HTMLInputElement).value = ""; drawRegionSuggest(); });
$("#region-search").addEventListener("blur", () => setTimeout(syncRegionFields, 150));
// Замок: закреплённую территорию снимает, «плавающий» регион под центром — фиксирует
$("#lock-button").addEventListener("click", () => {
  if (state.territory) {
    state.territory = null;
    updateTerritoryCard();
    refreshCascade();
    loadMapData();
  } else if (state.dataRegion !== null) {
    state.territory = { id: state.dataRegion, name: regionName(state.dataRegion) || String(state.dataRegion) };
    updateTerritoryCard();
    refreshCascade();
    loadMapData();
  }
});
document.addEventListener("click", (event) => {
  const target = event.target as Element;
  if (!target.closest(".region-search")) $("#region-suggest").hidden = true;
  if (!target.closest("#date-menu") && !target.closest("#date-range-button") && !target.closest("#advanced-date-range-button") && !$("#date-menu").hidden) closeDateMenu();
});
document.querySelectorAll("[data-quick-map]").forEach((button) => button.addEventListener("click", () => switchMapClient(button.dataset.quickMap as "leaflet" | "yandex" | "mapbox")));
$("#chart-button").addEventListener("click", () => {
  // По дням/часам без дат построить нечего — сразу открываем доступный разрез «По типам»
  if (state.chartMode !== "types" && (!chartDatesAvailable() || chartAxis(state.chartMode) === null)) setChartMode("types");
  // chartOpen нужен гейту дэшборда: после возврата из скрытых зумов график появляется,
  // только если пользователь его открыл
  state.chartOpen = true; $("#chart").hidden = false; renderChart();
});
$("#close-chart").addEventListener("click", () => { state.chartOpen = false; $("#chart").hidden = true; });
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
document.querySelectorAll("#heat-controls input").forEach((input) => input.addEventListener("input", updateHeatControls));
let moveTimer;
function scheduleMapLoad() { clearTimeout(moveTimer); state.abort?.abort(); state.dataLoadId++; moveTimer = setTimeout(loadMapData, 350); }
map.on("moveend", () => { if (state.mapClient === "leaflet") { scheduleMapLoad(); scheduleRegionLookup(); } });
// На время зум-жеста тепло скрывается классом heat-hold (DTP-30):
// канвас листлета тянется трансформом панели и выглядит «плывущим»
map.on("zoomstart", () => map.getContainer().classList.add("heat-hold"));
map.on("zoomend", () => { if (state.mapClient !== "leaflet") return; map.getContainer().classList.remove("heat-hold"); applyHeatMode(); });
applyLanguage();
const savedMapClient = state.mapClient; state.mapClient = "leaflet"; renderMapSwitcher(); if (savedMapClient !== "leaflet") switchMapClient(savedMapClient);
loadFilters();
scheduleRegionLookup();
