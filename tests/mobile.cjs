// Мобильные e2e-тесты dtpstat-pages: состояния панелей фильтров на главной.
// Запуск: npm run build && npm run test:mobile
// Нужны headless Chrome и доступный бэкенд (serve.mjs проксирует /api).
//
// Проверяются сценарии из последних правок мобильной версии (v=101…104):
// полные экраны панелей, sticky-строка региона с кнопкой, скрытая статистика
// в фильтрах, кнопка дэшборда, «мёртвая» полоса снизу — и главное, регресс
// бага «‹ в про-фильтрах → белый экран вместо карты» (фон стандартной панели
// сквозь прозрачную свёрнутую про-панель).
const fs = require("fs");
const { join } = require("path");
const { ARTIFACTS, ROOT, Tab, check, findFreePort, isWhite, scenario, sleep, startChrome, startServer } = require("./lib.cjs");

const PAGE = "http://localhost:PORT/";
const VIEW = { w: 0, h: 0 };

const state = `(() => {
  const $ = (s) => document.querySelector(s);
  const vis = (el) => { if (!el) return null; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return { display: c.display, hidden: el.hidden, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), bg: c.backgroundColor }; };
  const row = $(".filters:not(.collapsed) .region-search");
  return JSON.stringify({
    body: document.body.className,
    viewport: { w: innerWidth, h: innerHeight },
    mapPage: vis($("#map")),
    map: vis($("#leaflet-map")),
    filters: vis($("#filters")),
    filtersClass: $("#filters").className,
    row: vis(row),
    advRow: vis($(".advanced-filter .region-search")),
    hideBtn: vis($("#hide-filters")),
    stats: vis($("#statistics")),
    chartBtn: vis($("#chart-button")),
    adv: vis($("#advanced-filter")),
    advBody: vis($(".advanced-body")),
    closeAdvBtn: vis($("#close-advanced")),
    backBtn: vis($("#back-to-basic")),
    chart: vis($("#chart")),
    chartHead: vis($("#chart .chart-head")),
    closeChart: vis($("#close-chart")),
    bodyEl: vis($("#chart .chart-body")),
    sideBtn: vis($("#chart-side")),
    chartCount: ($("#chart-count") || {}).textContent,
    barsCount: ($("#bars") || { children: [] }).children.length,
    yandex: vis($("#yandex-map")),
  });
})()`;

const read = (tab) => tab.evaluate(state).then(JSON.parse);

// в центре экрана — карта, а не белая панель
async function mapNotCovered(tab, label) {
  const px = await tab.pixelAt(VIEW.w / 2, VIEW.h / 2);
  check(`${label}: карта видна (пиксель в центре не белый)`, !isWhite(px), `центр = rgb(${px.join(",")})`);
}

async function rowAndButtonAligned(tab, label) {
  const s = await read(tab);
  const d = JSON.stringify({ row: s.row, btn: s.hideBtn });
  check(`${label}: строка региона прибита к верху`, s.row && s.row.y >= -1 && s.row.y <= 26, d);
  check(`${label}: кнопка сворачивания на строке`, s.row && Math.abs(s.hideBtn.y - s.row.y) <= 6, d);
}

async function backPinnedBottom(tab, label) {
  const s = await read(tab);
  check(`${label}: «Назад к стандартным фильтрам» внизу экрана`, s.backBtn.display !== "none" && s.backBtn.bottom >= VIEW.h - 60 && s.backBtn.bottom <= VIEW.h + 2, JSON.stringify(s.backBtn));
}

async function scrollToBottom(tab, selectors) {
  // скроллим все возможные контейнеры — скроллером бывает любой из них
  await tab.evaluate(`for (const s of ${JSON.stringify(selectors)}) { const el = document.querySelector(s); if (el) el.scrollTop = 99999; } undefined`);
}

// --- сценарии ----------------------------------------------------------------

async function mainView(tab, label) {
  return scenario(`${label}: главный вид — карта, карточка статистики, свёрнутые фильтры`, tab, async () => {
    const s = await read(tab);
    check("карта по умолчанию — Яндекс", s.yandex && !s.yandex.hidden && s.map.hidden, JSON.stringify({ yandex: s.yandex, leaflet: s.map }));
    check("карта на всю высоту экрана (нет мёртвой полосы)", s.mapPage.h >= VIEW.h - 2, JSON.stringify(s.mapPage));
    await mapNotCovered(tab, label);
    check("фильтры свёрнуты", s.body.includes("filters-collapsed") && /\bcollapsed\b/.test(s.filtersClass), JSON.stringify({ body: s.body, filtersClass: s.filtersClass }));
    check("карточка статистики видна", s.stats && s.stats.display !== "none" && s.stats.w > 150, JSON.stringify(s.stats));
    check("кнопка дэшборда видна", s.chartBtn.display !== "none" && s.chartBtn.w > 0, JSON.stringify(s.chartBtn));
  });
}

async function filtersOpenScrollClose(tab, label) {
  return scenario(`${label}: фильтры — полный экран, sticky-строка, сворачивание`, tab, async () => {
    await tab.click("#hide-filters");
    await sleep(500);
    let s = await read(tab);
    check("панель на весь экран", s.filters.w === VIEW.w && s.filters.h >= VIEW.h - 6, JSON.stringify(s.filters));
    check("статистика внутри фильтров скрыта", s.stats.display === "none", JSON.stringify(s.stats));
    await rowAndButtonAligned(tab, `${label}: фильтры сверху`);
    await scrollToBottom(tab, ["#filters .filters-body", "#filters"]);
    await sleep(400);
    await rowAndButtonAligned(tab, `${label}: фильтры после прокрутки`);
    await tab.click("#hide-filters");
    await sleep(500);
    await mapNotCovered(tab, `${label}: закрыли фильтры`);
    s = await read(tab);
    check("вернулись к карточке статистики", s.stats.display !== "none" && s.body.includes("filters-collapsed"), JSON.stringify({ body: s.body, stats: s.stats }));
  });
}

async function proFlow(tab, label) {
  return scenario(`${label}: про-фильтры — открытие, sticky-строка, «Назад»`, tab, async () => {
    await tab.click("#hide-filters");
    await sleep(400);
    await tab.click("#professional-toggle");
    await sleep(1200);
    let s = await read(tab);
    check("про-панель открыта на весь экран", s.body.includes("advanced-open") && s.adv.w === VIEW.w && s.adv.h >= VIEW.h - 6, JSON.stringify({ body: s.body, adv: s.adv }));
    await backPinnedBottom(tab, label);
    await scrollToBottom(tab, [".advanced-body"]);
    await sleep(400);
    s = await read(tab);
    check("строка региона в про-фильтрах sticky", s.advRow && s.advRow.y >= -1 && s.advRow.y <= 26 && s.advRow.w > 0, JSON.stringify(s.advRow));
    check("«‹» на строке региона", s.closeAdvBtn.display !== "none" && Math.abs(s.closeAdvBtn.y - s.advRow.y) <= 6, JSON.stringify({ row: s.advRow, btn: s.closeAdvBtn }));
    await backPinnedBottom(tab, `${label}: после прокрутки`);

    // Регресс бага v=104: «‹» сворачивает про-панель, сквозь неё должна быть видна карта.
    await tab.click("#close-advanced");
    await sleep(500);
    s = await read(tab);
    check("«‹» сворачивает про-панель в пилюлю", s.body.includes("advanced-collapsed") && s.closeAdvBtn.display !== "none" && s.closeAdvBtn.w > 0, JSON.stringify({ body: s.body, btn: s.closeAdvBtn }));
    check("панели прозрачны в свёрнутом состоянии", s.adv.bg === "rgba(0, 0, 0, 0)" && s.filters.bg === "rgba(0, 0, 0, 0)", JSON.stringify({ adv: s.adv.bg, filters: s.filters.bg }));
    await mapNotCovered(tab, `${label}: после «‹»`);

    // Пилюля возвращает про-панель, «Назад к стандартным фильтрам» — к обычным.
    await tab.click("#close-advanced");
    await sleep(500);
    s = await read(tab);
    check("пилюля разворачивает про-панель", s.body.includes("advanced-open") && !s.body.includes("advanced-collapsed"), s.body);
    await tab.click("#back-to-basic");
    await sleep(500);
    s = await read(tab);
    check("«Назад» открывает стандартные фильтры", !s.body.includes("advanced-open") && s.adv.display === "none" && s.filters.w === VIEW.w, JSON.stringify({ body: s.body, adv: s.adv, filters: s.filters }));
    await tab.click("#hide-filters");
    await sleep(500);
    await mapNotCovered(tab, `${label}: полное закрытие`);
  });
}

async function dashboard(tab, label) {
  return scenario(`${label}: дэшборд — полный экран, разрезы, закрытие`, tab, async () => {
    await tab.click("#chart-button");
    await sleep(800);
    let s = await read(tab);
    check("дэшборд открыт на весь экран", s.chart.display !== "none" && s.chart.w === VIEW.w && s.chart.h >= VIEW.h - 6, JSON.stringify(s.chart));
    check("в шапке счётчики заполнены", s.chartCount !== "—", `ДТП=${s.chartCount}`);
    check("диаграмма отрисована", s.barsCount > 0, `детей в #bars: ${s.barsCount}`);
    // регресс узких дорожек (v=106): подпись процентов, прижатая к правому краю бара,
    // не должна вылезать влево на колонку числа
    const ovl = await tab.evaluate(`(() => {
      let hits = 0;
      for (const t of document.querySelectorAll(".htrack")) {
        const pct = t.querySelector(".hpct"); const cnt = t.previousElementSibling;
        if (!pct || !cnt) continue;
        if (pct.getBoundingClientRect().left < cnt.getBoundingClientRect().right - 0.5) hits++;
      }
      return hits;
    })()`);
    check("подписи процентов не наезжают на числа", ovl === 0, `строк с наездом: ${ovl}`);
    check("разрезы — чипсы над диаграммой", s.sideBtn.display === "flex" && s.sideBtn.y < s.bodyEl.y, JSON.stringify({ side: s.sideBtn, body: s.bodyEl }));
    // тело скроллится, шапка на месте
    await tab.evaluate(`const el = document.querySelector("#chart .chart-body"); if (el) el.scrollTop = 99999; undefined`);
    await sleep(300);
    s = await read(tab);
    check("шапка дэшборда закреплена сверху", s.chartHead.y <= 22 && s.closeChart.display !== "none", JSON.stringify({ head: s.chartHead, close: s.closeChart }));
    await tab.click("#close-chart");
    await sleep(500);
    s = await read(tab);
    check("«Скрыть» закрывает дэшборд", s.chart.display === "none", JSON.stringify(s.chart));
    await mapNotCovered(tab, `${label}: после закрытия дэшборда`);
  });
}

// --- прогон --------------------------------------------------------------------

(async () => {
  const distIndex = join(ROOT, "dist", "index.html");
  if (!fs.existsSync(distIndex)) { console.error("Нет dist/ — сначала npm run build"); process.exit(2); }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const [serverPort, cdp] = [await findFreePort(), await startChrome()];
  const server = await startServer(serverPort);
  const base = PAGE.replace("PORT", serverPort);
  console.log(`сервер: ${base}  chrome CDP: :${cdp.port}`);

  let tab;
  const suites = [];
  try {
    tab = await Tab.open(cdp.port);

    for (const [label, w, h] of [["390×844", 390, 844], ["320×568", 320, 568]]) {
      VIEW.w = w; VIEW.h = h;
      await tab.setViewport(w, h);
      await tab.navigate(base);
      suites.push(await mainView(tab, label));
      suites.push(await filtersOpenScrollClose(tab, label));
      suites.push(await proFlow(tab, label));
      suites.push(await dashboard(tab, label));
    }

    // Десктоп: те же переходы не должны ломать карту (панель слева, пилюля и т.д.)
    VIEW.w = 1280; VIEW.h = 900;
    await tab.setViewport(1280, 900, { mobile: false, dsf: 1 });
    await tab.navigate(base);
    await scenario("десктоп: про-фильтры и возврат не ломают карту", tab, async () => {
      let s = await read(tab);
      check("стандартные фильтры открыты колонкой", !s.body.includes("filters-collapsed") && s.filters.w === 340, JSON.stringify(s.filters));
      const px = await tab.pixelAt(900, 450);
      check("карта видна правее панели", !isWhite(px), `rgb(${px.join(",")})`);
      await tab.click("#professional-toggle");
      await sleep(1200);
      s = await read(tab);
      check("про-панель 540px", s.adv.w === 540, JSON.stringify(s.adv));
      await tab.click("#close-advanced"); // свернуть в пилюлю
      await sleep(500);
      s = await read(tab);
      check("десктоп: пилюля прозрачного фона не меняет карту", s.filters.bg === "rgba(0, 0, 0, 0)" || s.filters.display === "flex", JSON.stringify(s.filters));
      const px2 = await tab.pixelAt(900, 450);
      check("десктоп: карта видна после «‹»", !isWhite(px2), `rgb(${px2.join(",")})`);
      await tab.click("#close-advanced");
      await sleep(500);
      await tab.click("#back-to-basic");
      await sleep(500);
      s = await read(tab);
      check("десктоп: «Назад» возвращает стандартные фильтры", !s.body.includes("advanced-open") && s.adv.display === "none" && s.filters.display !== "none", JSON.stringify({ body: s.body, adv: s.adv }));
    });

    const failed = suites.filter((ok) => !ok).length;
    console.log(`\n= Итог: ${suites.length - failed}/${suites.length} сценариев прошли${failed ? `, ${failed} провалено (скриншоты в tests/artifacts/)` : ""}`);
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    console.error(e);
    process.exitCode = 2;
  } finally {
    if (tab) tab.close();
    server.kill();
    cdp.child.kill();
    // chrome дописывает файлы профиля после kill — чистим с ретраем
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(cdp.profile, { recursive: true, force: true }); break; } catch { await sleep(300); }
    }
    setTimeout(() => process.exit(process.exitCode || 0), 300);
  }
})();
