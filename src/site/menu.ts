// Мобильное меню статических страниц (about, team, blog, support) — по макету:
// полупрозрачная шторка у правого края под шапкой (шапка с крестиком остаётся
// сверху), ссылки вправо, внизу «Поддержать проект» со шкалой сбора.
// Модуль общий, поэтому стили инжексятся отсюда — четыре листа править не нужно;
// ссылки клонируются из десктопной навигации страницы вместе с data-i18n,
// так что переключение языка перекрашивает и меню.
const STYLE_ID = "dtp-mobile-menu-style";
const PANEL_CLASS = "dtp-mobile-menu";
// Шкала — как в футере о проекте/команде: серый трек, заливка 78% градиентом
// severity (красный → зелёный), под ней «Собрано…» и «до конца сбора»
const FUND_GRADIENT = "linear-gradient(90deg,#ff001a 0%,#ff7f24 26%,#ffb81f 53%,#17aa14 100%)";
const CSS = `
.${PANEL_CLASS}{position:fixed;z-index:900;top:65px;right:0;bottom:0;width:min(320px,86%);display:flex;flex-direction:column;padding:16px 20px 20px;background:rgba(255,255,255,.9);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:-12px 0 32px rgba(24,51,74,.18)}
.${PANEL_CLASS}[hidden]{display:none}
.${PANEL_CLASS}-backdrop{position:fixed;z-index:890;top:65px;left:0;right:0;bottom:0;background:rgba(24,51,74,.4);opacity:0;pointer-events:none;transition:opacity .15s ease}
body.menu-open .${PANEL_CLASS}-backdrop{opacity:1;pointer-events:auto}
.${PANEL_CLASS}-links{display:flex;flex-direction:column;align-items:flex-end;padding-top:8px}
.${PANEL_CLASS}-links a{padding:12px 0;color:#18334a;text-decoration:none;font-size:16px;line-height:21px}
.${PANEL_CLASS}-bottom{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.${PANEL_CLASS}-fund{height:20px;border-radius:10px;background:#d1dee4;overflow:hidden}
.${PANEL_CLASS}-fund i{display:block;height:100%;width:78%;background:${FUND_GRADIENT}}
.${PANEL_CLASS}-fund-row{display:flex;flex-direction:column;gap:2px;font-size:12px}
.${PANEL_CLASS}-fund-row:empty{display:none}
.${PANEL_CLASS}-support{display:flex;align-items:center;justify-content:center;min-height:40px;border-radius:10px;background:#18334a;color:#fff;text-decoration:none;font-size:14px;font-weight:500;letter-spacing:.15px}
body.menu-open{overflow:hidden}
/* Панель под шапкой (крестик в шапке должен оставаться кликабельным), поэтому
   на время открытого меню шапка поднимается над ней */
body.menu-open .header,body.menu-open .topbar,body.menu-open .site-header{z-index:950}
/* Крест закрытия вместо кнопки меню: полоски бургера гасим, крест рисуем
   псевдоэлементами самой кнопки — разметка бургера у страниц разная */
.menu,.menu-button{position:relative}
.menu span,.menu i,.menu-button span{transition:opacity .15s ease}
body.menu-open .menu span,body.menu-open .menu i,body.menu-open .menu-button span{opacity:0}
body.menu-open .menu::before,body.menu-open .menu::after,body.menu-open .menu-button::before,body.menu-open .menu-button::after{content:"";position:absolute;left:50%;top:50%;width:20px;margin:-1px 0 0 -10px;border-top:2px solid var(--ink,#18334a);transition:transform .15s ease}
body.menu-open .menu::before,body.menu-open .menu-button::before{transform:rotate(45deg)}
body.menu-open .menu::after,body.menu-open .menu-button::after{transform:rotate(-45deg)}
`;

export function initMobileMenu(): void {
  const burger = document.querySelector<HTMLElement>(".menu, .menu-button");
  const nav = document.querySelector<HTMLElement>("header nav");
  if (!burger || !nav || document.getElementById(PANEL_CLASS)) return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  // «Поддержать проект»: на самой странице поддержки это якорь на секцию,
  // на остальных — переход в ../support/. Ключ i18n берём у кнопки страницы
  const supportAnchor = document.querySelector<HTMLAnchorElement>('.support-button[href^="#"]');
  const supportHref = supportAnchor ? supportAnchor.getAttribute("href") : "../support/";
  const supportKey = supportAnchor?.dataset.i18n || document.querySelector<HTMLElement>('[data-i18n="support"]')?.dataset.i18n || "support";
  const panel = document.createElement("nav");
  panel.className = PANEL_CLASS;
  panel.hidden = true;
  panel.setAttribute("aria-label", "Меню");
  panel.innerHTML = `<div class="${PANEL_CLASS}-links"></div><div class="${PANEL_CLASS}-bottom"><span class="${PANEL_CLASS}-fund"><i></i></span><div class="${PANEL_CLASS}-fund-row"></div><a class="${PANEL_CLASS}-support" href="${supportHref}" data-i18n="${supportKey}">Поддержать проект</a></div>`;
  const links = panel.querySelector<HTMLElement>(`.${PANEL_CLASS}-links`);
  nav.querySelectorAll("a").forEach((link) => links.append(link.cloneNode(true)));
  // Подписи шкалы — те же узлы, что в футере страницы (data-i18n переживает клон);
  // где футера со сбором нет, строка остаётся пустой и прячется
  const fundRow = panel.querySelector<HTMLElement>(`.${PANEL_CLASS}-fund-row`);
  document.querySelectorAll(".fund div b").forEach((label) => fundRow.append(label.cloneNode(true)));
  const backdrop = document.createElement("div");
  backdrop.className = `${PANEL_CLASS}-backdrop`;
  document.body.append(backdrop, panel);
  const burgerLabel = burger.getAttribute("aria-label") || "Меню";
  const setOpen = (open: boolean) => {
    if (open) {
      // Шапка статична: из прокрученной страницы крестик закрытия недоступен —
      // меню всегда открываем от верха страницы
      window.scrollTo(0, 0);
    }
    document.body.classList.toggle("menu-open", open);
    panel.hidden = !open;
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : burgerLabel);
  };
  burger.addEventListener("click", () => setOpen(panel.hidden));
  backdrop.addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });
  // Бургер скрыт на десктопе — при ресайзе из мобильного меню выходим
  window.addEventListener("resize", () => { if (!panel.hidden && getComputedStyle(burger).display === "none") setOpen(false); });
}
