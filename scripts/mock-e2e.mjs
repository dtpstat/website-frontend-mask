// Временный E2E-мок: как serve.mjs, но /dtp/points с REGION (субъект под центром)
// возвращает детерминированную синтетику — e2e не зависит от продовых данных и скорости.
// /geom/getRegionUnderPoint проксируется на прод: подписи нужны настоящие.
// Запуск: PORT=8124 node mock-e2e.mjs
import { createServer } from "node:http";
import { request as tlsRequest } from "node:https";
import { statSync, createReadStream } from "node:fs";
import { join, extname, normalize } from "node:path";

const port = Number(process.env.PORT) || 8124;
const origin = "https://dtpstat-backend.7190805.xyz";
const root = new URL("../dist/", import.meta.url).pathname;

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "text/xml",
};

function proxy(path, cb) {
  const target = new URL(origin);
  const upstream = tlsRequest({
    hostname: target.hostname, port: target.port || 443, path, method: "GET",
    headers: { host: `${target.hostname}:${target.port || 443}` }, rejectUnauthorized: false,
  }, (answer) => {
    const chunks = [];
    answer.on("data", (chunk) => chunks.push(chunk));
    answer.on("end", () => cb(answer.statusCode, Buffer.concat(chunks), answer.headers["content-type"]));
  });
  upstream.on("error", () => cb(502, Buffer.from("{}"), "application/json"));
  upstream.end();
}

// Синтетические точки: детерминированные, внутри прямоугольника региона, в запрошенном периоде
const regionBoxes = { 36: [37.3, 55.55, 37.95, 55.95], 78: [30.1, 59.7, 30.8, 60.1] }; // г. Москва, Санкт-Петербург
function syntheticPoints(query) {
  const [west, south, east, north] = regionBoxes[Number(query.get("REGION"))] || [28, 49, 42, 62];
  const from = query.get("DATE_TIME_FROM") || "", to = query.get("DATE_TIME_TO") || "";
  const span = Math.max(north - south, east - west, 0.01);
  let step = span > 10 ? 0.5 : span > 3 ? 0.1 : 0.05;
  while (((north - south) / step) * ((east - west) / step) > 4000) step *= 2; // кап на размер ответа
  const features = [];
  for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step) {
    for (let lng = Math.ceil(west / step) * step; lng <= east; lng += step) {
      const seed = Math.round(lat * 1000) * 31 + Math.round(lng * 1000);
      if (seed % 3 === 0) continue;
      const day = 1 + (seed % 27);
      const iso = `${from.slice(0, 7)}-${String(day).padStart(2, "0")}T${String(seed % 24).padStart(2, "0")}:00:00`;
      if (iso < from.slice(0, 10) + "T00:00:00" || iso > to.slice(0, 10) + "T23:59:59") continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
        properties: { em_number: seed, date_time: iso, em_type_id: 1 + (seed % 9), veh_amount: 1 + (seed % 3), pers_amount: 2, lost_amount: seed % 7 === 0 ? 1 : 0, suffer_amount: seed % 2 ? 1 : 0, hv_category: seed % 7 === 0 ? 4 : seed % 2 ? 2 : 3, address: `Мок ${lat.toFixed(3)}, ${lng.toFixed(3)}` },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  const points = url.pathname === "/api/dtp/points";
  if (points && url.searchParams.has("REGION")) {
    console.log("[mock] points region", url.searchParams.toString());
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(syntheticPoints(url.searchParams)));
  }
  if (points) {
    console.log("[mock] points passthrough", url.searchParams.toString());
    return proxy(url.pathname + url.search, (status, body, type) => {
      res.writeHead(status, { "content-type": type || "application/json" });
      res.end(body);
    });
  }

  if (url.pathname.startsWith("/api/")) {
    return proxy(url.pathname + url.search, (status, body, type) => {
      res.writeHead(status, { "content-type": type || "application/json" });
      res.end(body);
    });
  }

  let path = normalize(decodeURIComponent(url.pathname));
  if (path === "/" || path === "\\") path = "/index.html";
  const file = join(root, path);
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});
server.listen(port, () => process.stdout.write(`mock on http://localhost:${port}\n`));
