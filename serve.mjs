// Локальный сервер разработки: раздаёт dist/ и проксирует /api на бэкенд dtp-stat
// (запасной origin через env DTP_ORIGIN; по умолчанию — стенд за cloudflare-туннелем).
// Запуск: npm run build && npm run serve → http://localhost:8080
import { createServer, request as plainRequest } from "node:http";
import { request as tlsRequest } from "node:https";
import { statSync, createReadStream } from "node:fs";
import { join, extname, normalize } from "node:path";

const port = Number(process.env.PORT) || 8080;
const origin = process.env.DTP_ORIGIN || "https://dtpstat-backend.7190805.xyz";
const root = new URL("./dist/", import.meta.url).pathname;

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "text/xml",
};

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  // /api/* — без изменений в бэкенд (тело и заголовки отдаются как есть, включая gzip)
  if (url.pathname.startsWith("/api/")) {
    const target = new URL(origin);
    const http = target.protocol === "http:" ? plainRequest : tlsRequest;
    const upstream = http({
      hostname: target.hostname,
      port: target.port || (target.protocol === "http:" ? 80 : 443),
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers, host: `${target.hostname}:${target.port || (target.protocol === "http:" ? 80 : 443)}` },
      rejectUnauthorized: false,
    }, (answer) => {
      const headers = { ...answer.headers };
      delete headers.connection; delete headers["keep-alive"]; delete headers["transfer-encoding"];
      res.writeHead(answer.statusCode || 502, headers);
      answer.pipe(res);
    });
    upstream.on("error", (error) => { res.writeHead(502); res.end(`proxy error: ${error.message}`); });
    req.pipe(upstream);
    return;
  }

  // остальное — статика из dist/, каталоги-resolve до index.html
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[\/\\])+/, "");
  let file = join(root, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
  } catch { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});

server.listen(port, () => console.log(`dtpstat-pages on http://localhost:${port} → API ${origin}`));
