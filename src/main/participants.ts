// Участники ДТП: конфиг (иконки, EM_TYPE/маски/прод-типы), чипы и про-галки

import { $, state, setStatus, actions } from "./context.js";
import { t, participantTranslations } from "./i18n.js";

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
function selectedParticipants() { return state.participants.filter((participant) => participant.selected).map((participant) => participant.value); }
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
      else if (participantFilterKey() !== filterBefore) actions.loadMapData();
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
    else if (participantFilterKey() !== filterBefore) actions.loadMapData();
  }); label.append(input, document.createTextNode(participantLabel(participant))); return label; }));
  severity.replaceChildren(...[...document.querySelectorAll<HTMLInputElement>('input[name="severity"]')].map((source) => { const value = Number(source.value), tone = state.filters.find((filter) => filter.name === "severity")?.values.find((item) => item.value === value)?.ui_tone || "light", label = document.createElement("label"), input = document.createElement("input"); label.className = `severity-tone ${tone}`; input.type = "checkbox"; input.checked = source.checked; input.disabled = source.disabled; input.addEventListener("change", () => { source.checked = input.checked; actions.loadMapData(); }); label.append(input, document.createTextNode(source.parentElement.textContent.trim())); return label; }));
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

export { participantConfig, participantLabel, selectedParticipants, participantEmTypes, participantProdTypeIds, renderParticipants, renderAdvancedControls };
