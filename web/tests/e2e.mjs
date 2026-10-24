// Uji interaksi, responsivitas, aksesibilitas, dan tangkapan layar dengan Playwright.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./serve.mjs";

const OUT = process.env.SHOT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "screenshots");
mkdirSync(OUT, { recursive: true });
const WIDTHS = [320, 375, 768, 1440];
const VIEWS = ["ringkasan", "konsol", "kinerja", "kesalahan", "metode"];
const failures = [];
const ok = (cond, msg) => { if (!cond) { failures.push(msg); console.error("GAGAL:", msg); } };

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  if (process.env.CPU_THROTTLE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_THROTTLE) });
  }
  const problems = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on("request", (r) => { if (!r.url().startsWith(base)) problems.push(`permintaan luar: ${r.url()}`); });

  for (const view of VIEWS) {
    await page.goto(`${base}/#/${view}`);
    await page.waitForSelector(`main[data-ready="${view}"] h1`);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `${view} @${width}: geser horizontal ${overflow}px`);
    const text = await page.evaluate(() => document.body.innerText);
    ok(!/[—–]/.test(text), `${view} @${width}: ada tanda pisah panjang`);
    ok(!/\b(AI04|DA10|p1_|p2_|isolation_forest|ambang_statistik|hemat_alarm)\b/.test(text), `${view} @${width}: istilah internal terlihat`);
    ok(!/\w_\w/.test(text), `${view} @${width}: garis bawah terlihat`);
    await page.screenshot({ path: join(OUT, `${view}-${width}-gelap.png`), fullPage: true });
    if (width === 1440 || width === 375) {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      for (const v of axe.violations) ok(false, `axe ${view} @${width}: ${v.id} (${v.nodes.length} elemen) ${v.help}`);
    }
  }

  // Interaksi konsol
  await page.goto(`${base}/#/konsol`);
  await page.waitForSelector('main[data-ready="konsol"] #verdict .stat');
  const verdict = () => page.locator("#verdict").innerText();
  const before = await verdict();
  await page.selectOption("#pilih-eksperimen", { index: 1 });
  await page.waitForURL(/exp=/);
  await page.waitForSelector('main[data-ready="konsol"] #verdict .stat');
  ok(page.url().includes("exp="), `konsol @${width}: pilihan rekaman tidak masuk ke URL`);
  await page.getByRole("button", { name: "Isolation Forest", exact: true }).first().click();
  await page.waitForSelector('main[data-ready="konsol"] #verdict .stat');
  ok(page.url().includes("model=isolation_forest"), `konsol @${width}: model tidak berubah`);
  await page.getByRole("button", { name: "Hemat alarm", exact: true }).first().click();
  await page.waitForSelector('main[data-ready="konsol"] #verdict .stat');
  // Geser ambang ke maksimum: tidak boleh ada alarm sama sekali
  await page.locator("#sl-ambang").fill("1000");
  const manual = await page
    .waitForFunction(
      () => /Diubah manual/.test(document.querySelector("main").innerText) && /Terlewat/.test(document.querySelector("#verdict").innerText),
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false);
  const v = await verdict();
  ok(manual && /0 kali/.test(v), `konsol @${width}: ambang maksimum seharusnya tanpa alarm dan berstatus manual. Isi: ${v.replace(/\n/g, " | ")}`);
  await page.getByRole("button", { name: "Kembalikan ke nilai hasil penyetelan" }).click();
  const reset = await page
    .waitForFunction(() => /Sesuai hasil penyetelan/.test(document.querySelector("main").innerText), null, { timeout: 5000 })
    .then(() => true, () => false);
  ok(reset, `konsol @${width}: reset gagal`);
  // Papan ketik pada grafik
  await page.locator(".chart-wrap").focus();
  const r0 = await page.locator("#keterangan-kursor").innerText();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const moved = await page
    .waitForFunction((before) => document.querySelector("#keterangan-kursor").innerText !== before, r0, { timeout: 5000 })
    .then(() => true, () => false);
  const r1 = await page.locator("#keterangan-kursor").innerText();
  ok(moved && /Detik/.test(r1), `konsol @${width}: panah tidak menggeser penanda`);
  await page.screenshot({ path: join(OUT, `konsol-interaksi-${width}-gelap.png`), fullPage: true });

  // Kinerja dan kesalahan: ganti skema dan model
  await page.goto(`${base}/#/kinerja`);
  await page.waitForSelector('main[data-ready="kinerja"] h1');
  await page.getByRole("button", { name: /Skema B/ }).click();
  await page.waitForFunction(() => document.querySelector("main caption")?.textContent.includes("Skema B"));
  await page.goto(`${base}/#/kesalahan`);
  await page.waitForSelector("main table");
  await page.getByRole("button", { name: "Isolation Forest", exact: true }).first().click();
  await page.waitForSelector("main table");

  // Tema terang
  await page.getByRole("button", { name: /Tema terang/ }).click();
  for (const view of VIEWS) {
    await page.goto(`${base}/#/${view}`);
    await page.waitForSelector(`main[data-ready="${view}"] h1`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, `${view}-${width}-terang.png`), fullPage: true });
    if (width === 1440) {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      for (const vi of axe.violations) ok(false, `axe terang ${view}: ${vi.id} (${vi.nodes.length} elemen) ${vi.help}`);
    }
  }
  for (const p of problems) ok(false, `@${width}: ${p}`);
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} kegagalan`);
  process.exit(1);
}
console.log("Semua uji e2e lulus");
