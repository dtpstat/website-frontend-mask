// Метка центра карты: едва заметное колечко в центре вида. Место счётчиков и регион данных
// ищутся по точке под центром (geom.getRegionUnderPoint / regionAtCenter) — метка тихо
// подсказывает, куда «смотрит» карта. Отдельный модуль, а не часть pipeline: к нему
// тянется geom (showResolving), а pipeline у geom в родителях — вышел бы цикл импортов.
// Видимость считает pipeline (гейт дэшборда): центр рулит данными, пока карточка
// статистики доступна (зум ≥ 6, внутри субъектов РФ) и замка нет — под замком место под
// центром не ищется. На время лукапа кольцо мягко пульсирует — общий ритм с «Определяем
// место…» в карточке

import { $ } from "./context.js";

// Видимость вместе с гейтом дэшборда: active = карточка доступна и замка нет.
// Заодно глушим пульс — после возврата метке нечего показывать
function updateCenterMark(active: boolean) {
  ($("#map-center") as HTMLElement).hidden = !active;
  if (active) return;
  ($("#map-center") as HTMLElement).classList.remove("resolving");
}

// Пульс лукапа места: общий ритм с «Определяем место…» (geom.showResolving)
function centerMarkResolving(resolving: boolean) {
  ($("#map-center") as HTMLElement).classList.toggle("resolving", resolving);
}

export { updateCenterMark, centerMarkResolving };
