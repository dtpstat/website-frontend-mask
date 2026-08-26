// @ts-nocheck
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = "https://dtp-stat.ru";
const root = process.cwd();
const assets = path.join(root, "blog", "assets");
const clean = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
const local = new Map<string, string>();

async function asset(value: string) {
  if (!value || !value.startsWith("/")) return value;
  if (local.has(value)) return local.get(value);
  const source = new URL(value, origin); const name = `${createHash("sha1").update(value).digest("hex").slice(0, 10)}-${path.basename(decodeURIComponent(source.pathname))}`;
  const response = await fetch(source); if (!response.ok) return "";
  await writeFile(path.join(assets, name), Buffer.from(await response.arrayBuffer()));
  const result = `assets/${name}`; local.set(value, result); return result;
}

async function localize(html: string) {
  const sources = [...html.matchAll(/\bsrc="([^"]+)"/g)].map((match) => match[1]);
  for (const source of sources) if (source.startsWith("/")) html = html.replaceAll(`src="${source}"`, `src="${await asset(source)}"`);
  return html
    .replace(/href="(?:https?:\/\/dtp-stat\.ru)?\/blog\/([^/]+)\/?"/g, 'href="?post=$1"')
    .replace(/href="https?:\/\/dtp-stat\.ru[^\"]*"/g, 'href="#"')
    .replaceAll("https://dtp-stat.ru", "сайте проекта")
    .replaceAll("dtp-stat.ru", "сайте проекта");
}

const index = await (await fetch(`${origin}/blog/`)).text();
const cards = [...index.matchAll(/<a href="\/blog\/([^/]+)\/">\s*<img src="([^"]+)">([\s\S]*?)<h3[^>]*>([\s\S]*?)<\/h3>/g)];
await mkdir(assets, { recursive: true });
const posts = await Promise.all(cards.map(async ([, slug, cover, before, rawTitle]) => {
  const page = await (await fetch(`${origin}/blog/${slug}/`)).text();
  const article = page.match(/<article[^>]*class="[^"]*\bpost\b[^"]*"[^>]*>([\s\S]*?)<\/article>/)?.[1] || "";
  const content = article.match(/<div class="col-sm-12 col-md-10">([\s\S]*?)<\/div>\s*<div class="d-sm-none/)?.[1] || "";
  const tags = [...before.matchAll(/<span class="tag">\s*([\s\S]*?)\s*<\/span>/g)].map((match) => clean(match[1]));
  return {
    slug, title: clean(rawTitle), tags, cover: await asset(cover),
    date: article.match(/<p class="extra">\s*(\d{2}\.\d{2}\.\d{4})/)?.[1] || "",
    content: await localize(content),
  };
}));
await writeFile(path.join(root, "src", "blog", "posts.ts"), `export type Post = { slug: string; title: string; tags: string[]; cover: string; date: string; content: string };\nexport const posts: Post[] = ${JSON.stringify(posts)};\n`);
console.log(`Downloaded ${posts.length} posts and ${local.size} images.`);
