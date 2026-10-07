// Дэшборд: разрезы дни/часы/месяцы/годы/типы, SVG-график

import { $, state, regionName } from "./context.js";
import { t, number, percent } from "./i18n.js";
import { period } from "./dates.js";
import { participantLabel } from "./participants.js";
import { applyPlace } from "./territory.js";
import { geoSelectionNames } from "./filters.js";

// Период данных: шесть полей-сегментов «ДД ММ ГГГГ» начала и конца фиксированной
// ширины (правка одного сегмента не двигает строку) + дропдаун пресетов (как на
// dtp-stat.ru): последний месяц с данными, предыдущий, годы и «За всё время»
function formatDate(value) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }

function chartBuckets() {
  const groups = new Map();
  for (const item of chartSource()) {
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

// Полная ось X временных разрезов — весь период запроса: все дни и все месяцы (лимиты 90 —
// дальше ось не строится и разрез честно отказывает), годы диапазона, часы 1–24.
// null = разрез при таком периоде недоступен
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
// График всегда с клиентскими фильтрами и по месту из карточки — как счётчики
// (под замком место закреплено); отмеченное место ДТП заменяет место под центром
const chartSource = () => geoSelectionNames().length ? state.items : applyPlace(state.items);
function setChartMode(mode: string) { state.chartMode = mode; document.querySelectorAll("#chart-side button[data-mode]").forEach((item) => item.classList.toggle("active", item.dataset.mode === mode)); }
function updateChartTabs() {
  const dates = chartDatesAvailable();
  document.querySelectorAll("#chart-side button[data-mode]").forEach((button) => {
    const mode = button.dataset.mode;
    // «По дням» доступна всегда (при наличии дат): дней больше 90 — по клику показываем
    // ошибку вместо графика, а не мёртвую кнопку
    const unavailable = mode !== "types" && (!dates || (mode !== "days" && chartAxis(mode) === null));
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
  // Плашка итогов — из того же набора, что и график: место из карточки с фильтрами,
  // как и счётчики карточки
  const rows = chartSource();
  const geo = geoSelectionNames();
  $("#chart-region").textContent = geo.length ? geo.join(", ") : state.place?.name ?? state.territory?.name ?? (regionName(state.dataRegion) || t("allRegions"));
  $("#chart-count").textContent = number().format(rows.length);
  $("#chart-injured-count").textContent = number().format(rows.reduce((sum, item) => sum + Number(item.injured || 0), 0));
  $("#chart-dead-count").textContent = number().format(rows.reduce((sum, item) => sum + Number(item.dead || 0), 0));
  $("#chart-title").textContent = chartTitle();
  $("#chart-period").textContent = `${t("forPeriod")}: ${formatDate($("#start-date").value)} - ${formatDate($("#end-date").value)}`;
  $("#chart-filters").textContent = `${t("activeFilters")}: ${activeFiltersSummary()}`;
  // Легенда по умолчанию — точки; в разрезе по типам превратится в заголовки колонок (модификатор ниже)
  $(".chart-legend").className = "chart-legend";
  $("#legend-label-deaths").textContent = t("deathsLegend");
  // Нет дат у точек или период слишком длинный — честное пояснение вместо пустой области графика
  if (state.chartMode !== "types" && !chartDatesAvailable()) {
    empty.textContent = t("chartNoDates");
    empty.hidden = false; bars.hidden = true;
    return;
  }
  if (state.chartMode !== "types" && chartAxis(state.chartMode) === null) {
    empty.textContent = state.chartMode === "days" ? t("chartTooManyDays") : t("chartRangeTooLong");
    empty.hidden = false; bars.hidden = true;
    return;
  }
  empty.hidden = true; bars.hidden = false;
  const values = chartBuckets();
  // Оси до «красивых» пределов (1/2/5×10^k), чтобы деления были целыми
  const niceCeil = (value: number) => { const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, value)))); for (const m of [1, 2, 5, 10]) if (m * mag >= value) return m * mag; return 10 * mag; };
  const maxCount = niceCeil(Math.max(...values.map(([, bucket]) => bucket.count), 1)), maxDead = niceCeil(Math.max(...values.map(([, bucket]) => bucket.dead), 1));
  // Разрез по типам (данные есть только он) — горизонтальные пары баров «ДТП/погибшие» как в макете:
  // серый и розово-красный, процент от суммы колонки внутри бара, над группами — заголовки
  if (state.chartMode === "types") {
    bars.className = "bars bars-horizontal";
    $(".chart-legend").className = "chart-legend chart-legend-columns";
    $("#legend-label-deaths").textContent = t("deathsCount");
    const countMax = Math.max(...values.map(([, bucket]) => bucket.count), 1), deadMax = Math.max(...values.map(([, bucket]) => bucket.dead), 1);
    const countSum = values.reduce((sum, [, bucket]) => sum + bucket.count, 0), deadSum = values.reduce((sum, [, bucket]) => sum + bucket.dead, 0);
    // ru-Intl ставит неразрывный пробел перед «%» — в макете его нет
    const pct = (share: number) => percent().format(share).replace(/ /g, "");
    bars.replaceChildren(...values.map(([label, bucket]) => {
      const row = document.createElement("div"); row.className = "hrow";
      row.title = `${label}: ${number().format(bucket.count)} ${t("accidents").toLowerCase()}, ${number().format(bucket.dead)} ${t("deaths")}`;
      const name = document.createElement("span"); name.className = "hlabel"; name.textContent = label; name.title = label;
      const count = document.createElement("span"); count.className = "hcount"; count.textContent = number().format(bucket.count);
      const crashTrack = document.createElement("span"); crashTrack.className = "htrack crash";
      const crashBar = document.createElement("i"); crashBar.style.width = `${Math.round(bucket.count / countMax * 100)}%`;
      const crashPct = document.createElement("span"); crashPct.className = "hpct"; crashPct.textContent = pct(countSum ? bucket.count / countSum : 0);
      // Подпись внутри бара, только когда тот достаточно широк; иначе (в т.ч. 0) — снаружи, за кончиком бара
      if (bucket.count / countMax >= 0.15) { crashBar.append(crashPct); crashTrack.append(crashBar); }
      else { crashPct.classList.add("hpct-out"); crashPct.style.left = `calc(${crashBar.style.width} + 8px)`; crashTrack.append(crashBar, crashPct); }
      const dead = document.createElement("span"); dead.className = "hcount"; dead.textContent = number().format(bucket.dead);
      const deadTrack = document.createElement("span"); deadTrack.className = "htrack dead";
      const deadBar = document.createElement("i"); deadBar.style.width = `${Math.round(bucket.dead / deadMax * 100)}%`;
      const deadPct = document.createElement("span"); deadPct.className = "hpct"; deadPct.textContent = pct(deadSum ? bucket.dead / deadSum : 0);
      if (bucket.dead / deadMax >= 0.15) { deadBar.append(deadPct); deadTrack.append(deadBar); }
      else { deadPct.classList.add("hpct-out"); deadPct.style.left = `calc(${deadBar.style.width} + 8px)`; deadTrack.append(deadBar, deadPct); }
      row.append(name, count, crashTrack, dead, deadTrack);
      return row;
    }));
    return;
  }
  // Разрезы по времени: комбо — полупрозрачные navy-столбцы (основа прямая, верх сильно
  // скруглён) по левой оси и пунктирная красная линия погибших с белой обводкой маркеров по правой
  bars.className = "bars bars-combo";
  // График занимает всю ширину панели без пустоты справа; шаг колонок не сжимаем ниже 24px
  // (в разрезе дней их до 90) — при нехватке ширины svg длиннее контейнера, .bars-combo
  // даёт горизонтальный скролл, позиция которого сохраняется между перерисовками
  const minSlot = 24, height = 300, padL = 46, padR = 46, padT = 14, padB = 24;
  const width = Math.max(bars.clientWidth || 900, padL + padR + values.length * minSlot, 320);
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const slot = plotW / values.length;
  const x = (index) => padL + slot * (index + 0.5);
  const colW = Math.max(8, Math.min(36, Math.round(slot * 0.7)));
  const yCount = (value) => padT + plotH * (1 - value / maxCount), yDead = (value) => padT + plotH * (1 - value / maxDead);
  const tick = (value) => number().format(value);
  const axis = (max, scale, side) => {
    const lines = [], steps = 5;
    for (let step = 0; step <= steps; step++) {
      const value = max / steps * step, y = scale(value);
      // Сетка и оси — по «2 stats_by_days» 431:0: линии #18334a @ .1, подписи Regular 10 @ .5
      lines.push(`<line x1="${side === "l" ? padL : padL + plotW}" y1="${y}" x2="${side === "l" ? padL + plotW : padL + plotW}" y2="${y}" stroke="#18334a" stroke-opacity=".1"></line>`);
      lines.push(`<text x="${side === "l" ? padL - 8 : padL + plotW + 8}" y="${y + 4}" text-anchor="${side === "l" ? "end" : "start"}" font-size="10" fill="#18334a" fill-opacity=".5">${tick(value)}</text>`);
    }
    return lines.join("");
  };
  // Столбец: скруглена только шапка, радиус 3 (дамповый 6 смотрелся пузато — попросили меньше),
  // у низких и узких — меньше, основание прямое
  const column = (cx: number, top: number, bottom: number) => {
    const radius = Math.min(3, colW / 2, Math.max(1, bottom - top)), left = cx - colW / 2, right = cx + colW / 2;
    return `M${left},${top + radius} A${radius},${radius} 0 0 1 ${right},${top + radius} L${right},${bottom} L${left},${bottom} Z`;
  };
  // Столбцы — по «2 stats_by_days» 431:0: заливка #18334a @ .22 (union-вектор баров), без градиента
  const columns = values.map(([, bucket], index) => `<path d="${column(x(index), yCount(bucket.count), padT + plotH)}" fill="#18334a" fill-opacity=".22"></path>`).join("");
  const deadPoints = values.map(([, bucket], index) => [x(index), yDead(bucket.dead)] as const);
  // Линия погибших — сплошная бледно-розовая, сглажена как Line_1 в макете (вектор 5362 из
  // dtp-old.fig): каждый пролёт — кубическая Безье с ГОРИЗОНТАЛЬНЫМИ контрольными точками
  // «C x1+dx,y1 x2-dx,y2 x2,y2», dx = половина пролёта. Касательная в каждой точке нулевая —
  // вокруг маркера линия всегда горизонтальна, а ордината кривой внутри пролёта — выпуклая
  // смесь концов, поэтому на чередовании нулей и значений линия не «ныряет» ниже оси
  // (Catmull-Rom здесь давал выброс под базу — потому и заменили)
  const base = padT + plotH;
  const smoothPath = (points: ReadonlyArray<readonly [number, number]>) => {
    if (points.length < 2) return "";
    const pts = points.map(([px, py]) => [px, Math.min(py, base)] as const);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let index = 0; index < pts.length - 1; index++) {
      const [x1, y1] = pts[index], [x2, y2] = pts[index + 1], dx = (x2 - x1) / 2;
      d += ` C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    return d;
  };
  // Линия #e31a1c: в дампе stroke-opacity .1, но на рендере фигмы ядро линии ≈ rgb(240,148,148)
  // (замер по скриншоту макета) = альфа ≈ .45 — беру её, при .1 линия бы не читалась
  const line = `<path d="${smoothPath(deadPoints)}" fill="none" stroke="#e31a1c" stroke-opacity=".45" stroke-width="2"></path>`;
  const markers = deadPoints.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="4" fill="#e31a1c" stroke="#fff" stroke-width="1.5"></circle>`).join("");
  // Подписи оси X: по дням — число, на первом числе месяца — имя месяца; месяца — ММ.ГГГГ, часы/годы — как есть.
  // Крайние подписи всегда, промежуточные — с шагом, при котором соседние не сливаются
  const monthName = (key: string) => {
    const name = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(state.language === "ru" ? "ru-RU" : "en-US", { month: "long" });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const axisLabel = (key) => state.chartMode === "days" ? (key.slice(8, 10) === "01" ? monthName(key) : key.slice(8, 10)) : state.chartMode === "months" ? `${key.slice(5, 7)}.${key.slice(0, 4)}` : key;
  const labelWidth = (text: string) => text.length * 6 + 6;
  const shown: boolean[] = values.map(() => false);
  const fits = (a: number, b: number, gap: number) => x(b) - x(a) >= (labelWidth(axisLabel(String(values[a][0]))) + labelWidth(axisLabel(String(values[b][0])))) / 2 + gap;
  shown[values.length - 1] = true;
  let previous = values.length - 1;
  for (let index = values.length - 2; index >= 1; index--) {
    if (fits(index, previous, 10)) { shown[index] = true; previous = index; }
  }
  // Крайняя левая подпись — пограничная: показываем всегда, когда она не перекрывает соседнюю
  if (values.length > 1) shown[0] = fits(0, previous, 2);
  const labels = values.map(([label], index) => shown[index] ? `<text x="${x(index)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="#18334a" fill-opacity=".5">${axisLabel(String(label)).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>` : "").join("");
  const scrollLeft = bars.scrollLeft;
  bars.replaceChildren(Object.assign(document.createElement("div"), { innerHTML: `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${axis(maxCount, yCount, "l")}${axis(maxDead, yDead, "r")}<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#18334a" stroke-opacity=".1"></line>${columns}${line}${markers}${labels}</svg>` }));
  bars.scrollLeft = scrollLeft;
}


export { chartAxis, chartDatesAvailable, setChartMode, renderChart };
