// Мини-инфраструктура мобильных e2e-тестов dtpstat-pages (см. tests/mobile.cjs).
// Поднимает dist/ через scripts/serve.mjs и headless Chrome, дёргает его по CDP.
// Пиксельные проверки: captureScreenshot с clip 1×1 → собственный декодер PNG
// (только IHDR+IDAT, bitDepth 8) — карта под панелями не «белая».
const { spawn } = require("child_process");
const { mkdtempSync } = require("fs");
const { createServer } = require("http");
const { join } = require("path");
const os = require("os");
const zlib = require("zlib");
const WebSocket = require("ws");

const ROOT = join(__dirname, "..");
const ARTIFACTS = join(__dirname, "artifacts");

// --- процессы ---------------------------------------------------------------

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on("error", reject);
  });
}

async function startServer(port) {
  const child = spawn(process.execPath, [join(ROOT, "scripts", "serve.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: "ignore",
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return child;
    } catch {}
    await sleep(200);
  }
  child.kill();
  throw new Error("serve.mjs не поднялся за 15с");
}

async function startChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  const bin = await new Promise((resolve) => {
    let i = 0;
    const next = () => { if (i >= candidates.length) return resolve(null); const c = candidates[i++]; spawn(c, ["--version"], { stdio: "ignore" }).on("close", (code) => (code === 0 ? resolve(c) : next())); };
    next();
  });
  if (!bin) throw new Error("не найден Chrome/Chromium (можно указать CHROME_BIN)");
  const profile = mkdtempSync(join(os.tmpdir(), "dtp-e2e-"));
  const child = spawn(bin, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { const [port] = require("fs").readFileSync(portFile, "utf8").split("\n"); if (port.trim()) return { child, port: port.trim(), profile }; } catch {}
    await sleep(200);
  }
  child.kill();
  throw new Error("headless Chrome не поднялся за 20с");
}

// --- CDP-вкладка -------------------------------------------------------------

class Tab {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.on("message", (raw) => this.onMessage(raw)); }

  onMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} (${msg.error.data || ""})`)) : resolve(msg.result);
    }
  }

  static async open(cdpPort) {
    const created = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
    await sleep(300);
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const info = list.find((t) => t.id === created.id);
    if (!info) throw new Error("вкладка не найдена после создания");
    const ws = new WebSocket(info.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
    const tab = new Tab(ws);
    tab.targetId = created.id;
    tab.cdpPort = cdpPort;
    await tab.send("Page.enable");
    return tab;
  }

  send(method, params = {}) {
    const msgId = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async setViewport(width, height, { mobile = true, dsf = 2 } = {}) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dsf, mobile });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  }

  async navigate(url, { settle = 10000 } = {}) {
    await this.send("Page.navigate", { url });
    await sleep(settle); // карта + данные ДТП с бэкенда
  }

  // evaluate с ожиданием значения; исключение в странице → ошибка теста
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }

  async click(selector) {
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }

  async screenshot() {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data, "base64");
  }

  // цвет пикселя в CSS-координатах страницы → [r,g,b] (клип 1×1, берём первый пиксель)
  async pixelAt(x, y) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", clip: { x, y, width: 1, height: 1, scale: 1 } });
    const { ch, pixels } = decodePng(Buffer.from(data, "base64"));
    return [pixels[0], pixels[1], pixels[2]].slice(0, ch);
  }

  close() {
    if (this.targetId) fetch(`http://127.0.0.1:${this.cdpPort}/json/close/${this.targetId}`).catch(() => {});
    this.ws.close();
  }
}

// --- PNG (минимум для скриншотов Chrome: bitDepth 8, truecolor/alpha) --------

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("не PNG");
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  const bitDepth = buf[24], colorType = buf[25];
  if (bitDepth !== 8) throw new Error(`PNG bitDepth ${bitDepth} не поддержан`);
  const ch = { 2: 3, 6: 4 }[colorType];
  if (!ch) throw new Error(`PNG colorType ${colorType} не поддержан`);
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = x >= ch && prev ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
  }
  return { w: width, h: height, ch, pixels };
}

const isWhite = ([r, g, b]) => r >= 250 && g >= 250 && b >= 250;

// --- прогон ------------------------------------------------------------------

const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`   ${ok ? "✓" : "✗"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  return ok;
}

async function scenario(label, tab, fn) {
  results.length = 0;
  let crashed = null;
  console.log(`\n▸ ${label}`);
  try {
    await fn();
  } catch (e) {
    console.log(`  ✗ ошибка сценария: ${e.message}`);
    crashed = e;
    results.push({ name: "(сценарий выполним)", ok: false, detail: e.message });
  }
  const failed = results.filter((r) => !r.ok);
  const ok = !crashed && failed.length === 0;
  console.log(`  ${ok ? `ok (${results.length} проверок)` : `ПРОВАЛ (${failed.length}/${results.length})`}`);
  if (!ok && tab) {
    const slug = label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");
    try { require("fs").writeFileSync(require("path").join(ARTIFACTS, `${slug}.png`), await tab.screenshot()); } catch {}
  }
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { ROOT, ARTIFACTS, Tab, findFreePort, startServer, startChrome, check, scenario, sleep, isWhite };
