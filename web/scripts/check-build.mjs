// "Build" statis: tidak ada bundler. Memeriksa bahwa semua berkas yang dirujuk ada, tidak ada
// skrip atau gaya sebaris, dan ukuran berkas di bawah batas Cloudflare Pages (25 MiB).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const errors = [];
const html = readFileSync(join(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const ref = m[1].split("?")[0];
  if (/^(https?:|mailto:)/.test(ref)) continue;
  if (!existsSync(join(root, ref))) errors.push(`rujukan hilang: ${ref}`);
}
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) errors.push("ada skrip sebaris");
if (/<style[\s>]/i.test(html) || /\sstyle="/i.test(html)) errors.push("ada gaya sebaris di HTML");

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
let total = 0;
for (const p of walk(root)) {
  const size = statSync(p).size;
  total += size;
  if (size > 25 * 1024 * 1024) errors.push(`berkas terlalu besar: ${p}`);
  if (p.endsWith(".js")) {
    const src = readFileSync(p, "utf8");
    if (/https?:\/\/(?!github\.com\/muhshandy-dev|www\.w3\.org)/.test(src)) errors.push(`URL luar di ${p}`);
    if (/[—–]/.test(src)) errors.push(`tanda pisah panjang di ${p}`);
  }
}
for (const need of ["_headers", "favicon.svg", "data/ringkasan.json"]) {
  if (!existsSync(join(root, need))) errors.push(`berkas wajib hilang: ${need}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`build statis OK: ${walk(root).length} berkas, ${(total / 1024).toFixed(0)} KiB`);
