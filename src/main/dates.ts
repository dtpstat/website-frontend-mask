// Период: поля-сегменты «ДД ММ ГГГГ», меню пресетов, period()

import { $, dataRange, actions } from "./context.js";
import { t, intlFormatter } from "./i18n.js";

function period() { return { start: $("#start-date").value, end: $("#end-date").value }; }
function monthEndValue(value) { const [year, month] = value.split("-").map(Number); return `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`; }

function renderDateFields() {
  const [sy, sm, sd] = $("#start-date").value.split("-"), [ey, em, ed] = $("#end-date").value.split("-");
  const values = { sd, sm, sy, ed, em, ey };
  document.querySelectorAll("[data-date-seg]").forEach((node) => {
    const input = node as HTMLInputElement;
    if (input !== document.activeElement) input.value = values[input.dataset.dateSeg];
  });
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

// Сегменты «ДД ММ ГГГГ» → YYYY-MM-DD, иначе null (неполные или несуществующие даты применения не получают)
function segISO(d, m, y) {
  if (!/^\d{2}$/.test(d) || !/^\d{2}$/.test(m) || !/^\d{4}$/.test(y)) return null;
  const iso = `${y}-${m}-${d}`;
  const date = new Date(`${iso}T00:00:00`);
  return date.getDate() === Number(d) && date.getMonth() + 1 === Number(m) ? iso : null;
}

// Применение набранного периода из панели root (вызывается при завершении правки):
// обе даты полные и корректные → swap перепутанных дат и клэмп к диапазону данных
// (как раньше), запись скрытых полей и перезагрузка карты, если период изменился.
// Иначе — false: blur-обработчик откатит поля к действующему периоду
function commitDateRange(root: ParentNode) {
  const seg = (name: string) => { const input = root.querySelector(`[data-date-seg="${name}"]`) as HTMLInputElement | null; return input ? input.value.trim() : ""; };
  const start = segISO(seg("sd"), seg("sm"), seg("sy")), end = segISO(seg("ed"), seg("em"), seg("ey"));
  if (!start || !end) return false;
  let [from, till] = start <= end ? [start, end] : [end, start];
  const now = new Date(), todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (from < dataRange.min) from = dataRange.min;
  if (till > todayValue) till = todayValue;
  if (from > till) from = till;
  if ($("#start-date").value !== from || $("#end-date").value !== till) { $("#start-date").value = from; $("#end-date").value = till; actions.loadMapData(); }
  renderDateFields(); // нормализуем отображение (swap/клэмп) в обеих панелях, печатающее поле не трогаем
  return true;
}

// Уход фокуса из панели периода: одиночные день/месяц дополняем нулём («3» → «03»),
// после чего период без корректных дат откатывается к действующему
function blurDateRange(root: ParentNode) {
  (root.querySelectorAll("[data-date-seg]") as NodeListOf<HTMLInputElement>).forEach((input) => { if (input.maxLength === 2 && input.value.length === 1) input.value = `0${input.value}`; });
  if (!commitDateRange(root)) renderDateFields();
}

function renderDateMenu() {
  const menu = $("#date-menu");
  menu.replaceChildren(...dateMenuPresets().map((preset) => { const item = document.createElement("div"); item.className = "date-value"; item.textContent = preset.label; item.addEventListener("click", () => { $("#start-date").value = preset.start; $("#end-date").value = preset.end; closeDateMenu(); actions.loadMapData(); }); return item; }));
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

export { period, renderDateFields, blurDateRange, closeDateMenu, openDateMenu };
