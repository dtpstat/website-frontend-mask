// Метка центра карты: едва заметное колечко на якоре — в центре видимой части карты.
// Место счётчиков и регион данных ищутся по этой точке (geom.getRegionUnderPoint /
// regionAtCenter через view.probe) — метка тихо подсказывает, куда «смотрит» карта.
// Точка не в геометрическом центре контейнера: боковая панель фильтров съедает левую
// полосу вида, якорь — центр свободной части (probeOffsetX в maps.ts); метка стоит там
// же инлайновым сдвигом от CSS-центра. Отдельный модуль, а не часть pipeline: к нему
// тянется geom (showResolving), а pipeline у geom в родителях — вышел бы цикл импортов.
// Видимость считает pipeline (гейт дэшборда): центр рулит данными, пока карточка
// статистики доступна (зум ≥ 6, внутри субъектов РФ) и замка нет — под замком место под
// якорем не ищется. На время лукапа кольцо мягко пульсирует — общий ритм с «Определяем
// место…» в карточке

import { $ } from "./context.js";
import { probeOffsetX } from "./maps.js";

// Метка на якоре: сдвиг от CSS-центра инлайном — CSS-позиция остаётся запасной
function positionCenterMark() {
  ($("#map-center") as HTMLElement).style.left = `calc(50% + ${probeOffsetX()}px)`;
}

// Панель свернули/развернули, окно переехало брейкпоинт 800px — свободная полоса другая.
// Реальный сдвиг якоря (dx) запускает перезапуск лукапов — место и регион под ним могли
// смениться (колбэк из app.ts: сам centermark не знает ни geom, ни pipeline). Настроечные
// пересчёты без смены dx — только перестановка метки
function initCenterMark(onShift: () => void) {
  let appliedDx: number | null = null;
  const apply = () => {
    positionCenterMark();
    const dx = probeOffsetX();
    if (dx === appliedDx) return;
    const boot = appliedDx === null;
    appliedDx = dx;
    if (!boot) onShift();
  };
  apply();
  new ResizeObserver(apply).observe(($(".filters") as HTMLElement));
  window.addEventListener("resize", apply);
}

// Видимость вместе с гейтом дэшборда: active = карточка доступна и замка нет.
// Заодно глушим пульс — после возврата метке нечего показывать
function updateCenterMark(active: boolean) {
  if (active) positionCenterMark(); // позиция могла устареть, пока метка была скрыта
  ($("#map-center") as HTMLElement).hidden = !active;
  if (active) return;
  ($("#map-center") as HTMLElement).classList.remove("resolving");
}

// Пульс лукапа места: общий ритм с «Определяем место…» (geom.showResolving)
function centerMarkResolving(resolving: boolean) {
  ($("#map-center") as HTMLElement).classList.toggle("resolving", resolving);
}

export { updateCenterMark, centerMarkResolving, initCenterMark };
