// Метка центра карты: тонкое перекрестие в центре вида. Место счётчиков и регион данных
// ищутся по точке под центром (geom.getRegionUnderPoint / regionAtCenter) — метка
// подсказывает, куда «смотрит» карта и с какого района приезжают числа. Отдельный модуль,
// а не часть pipeline: к нему тянется geom (showResolving), а pipeline у geom в родителях —
// вышел бы цикл импортов. Видимость считает pipeline (гейт дэшборда): центр рулит данными,
// пока карточка статистики доступна (зум ≥ 6, внутри субъектов РФ) и замка нет — под замком
// место под центром больше не ищется. На время лукапа кольцо пульсирует — общий ритм
// с «Определяем место…» в карточке; на смене места под меткой тает плашка с его названием

import { $ } from "./context.js";

// Видимость вместе с гейтом дэшборда: active = карточка доступна и замка нет.
// Заодно глушим пульс и плашку — после возврата метки им нечего показывать
function updateCenterMark(active: boolean) {
  ($("#map-center") as HTMLElement).hidden = !active;
  if (active) return;
  ($("#map-center") as HTMLElement).classList.remove("resolving");
  ($("#map-center-label") as HTMLElement).classList.remove("visible");
}

// Пульс лукапа места: общий ритм с «Определяем место…» (geom.showResolving)
function centerMarkResolving(resolving: boolean) {
  ($("#map-center") as HTMLElement).classList.toggle("resolving", resolving);
}

// Плашка с названием места: появляется на смене места под центром, тает через 2.4с.
// Пинг — только на реальной смене имени (renderMapData зовётся на каждый ход карты);
// таймер один — частая смена (быстрый пан через районы) перезапускает показ, а не копит анимации
let lastName: string | null = null, labelTimer = 0;
function pingCenterMark(name: string | null) {
  if (name === lastName) return;
  lastName = name;
  const mark = $("#map-center") as HTMLElement;
  // Под замком или вне гейта метка скрыта — «чужих» названий не показываем
  if (!name || mark.hidden) return;
  const label = $("#map-center-label") as HTMLElement;
  label.textContent = name;
  label.classList.add("visible");
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => label.classList.remove("visible"), 2400);
}

export { updateCenterMark, centerMarkResolving, pingCenterMark };
