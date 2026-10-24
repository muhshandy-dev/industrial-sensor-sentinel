// Uji interaksi, animasi, responsivitas, aksesibilitas, dan tangkapan layar dengan Playwright.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./serve.mjs";
import { stateAt } from "../public/js/evaluation.js";
import { evaluateExperiment } from "../public/js/logic.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_DIR || join(here, "..", "..", "screenshots");
mkdirSync(OUT, { recursive: true });
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(",").map(Number) : [320, 375, 768, 1440];
const VIEWS = ["ringkasan", "konsol", "kinerja", "kesalahan", "metode"];
const failures = [];
const ok = (cond, msg) => { if (!cond) { failures.push(msg); console.error("GAGAL:", msg); } };
const dataDir = join(here, "..", "public", "data");
const summary = JSON.parse(readFileSync(join(dataDir, "ringkasan.json")));
const loadExp = (id) => JSON.parse(readFileSync(join(dataDir, summary.eksperimen.find((e) => e.id === id).berkas)));

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

async function waitView(page, view) {
  await page.waitForSelector(`main[data-ready="${view}"] h1`);
  if (view === "ringkasan") await page.waitForSelector(".hero-card svg");
  if (view === "kinerja" || view === "kesalahan") await page.waitForSelector('main[data-viz="siap"]');
  if (view === "konsol") await page.waitForSelector('#pemutar[data-intro="selesai"]');
}

function watch(page, problems) {
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on("request", (r) => { if (!r.url().startsWith(base)) problems.push(`permintaan luar: ${r.url()}`); });
}

// 1. Semua halaman, semua lebar, gerak dikurangi agar tangkapan layar dan axe melihat keadaan akhir.
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (process.env.CPU_THROTTLE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_THROTTLE) });
  }
  const problems = [];
  watch(page, problems);

  for (const view of VIEWS) {
    await page.goto(`${base}/#/${view}`);
    await waitView(page, view);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) {
      const culprits = await page.evaluate(() => [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
        .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(" ")[0]}`).join(", "));
      ok(false, `${view} @${width}: geser horizontal ${overflow}px (${culprits})`);
    }
    const text = await page.evaluate(() => document.body.innerText);
    ok(!/[—–]/.test(text), `${view} @${width}: ada tanda pisah panjang`);
    ok(!/\b(AI04|DA10|p1_|p2_|isolation_forest|ambang_statistik|hemat_alarm|JSON|pipeline|framework)\b/i.test(text), `${view} @${width}: istilah internal terlihat`);
    ok(!/\w_\w/.test(text), `${view} @${width}: garis bawah terlihat`);
    await page.screenshot({ path: join(OUT, `${view}-${width}-gelap.png`), fullPage: true });
    if (width === 1440 || width === 375) {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      for (const v of axe.violations) ok(false, `axe ${view} @${width}: ${v.id} (${v.nodes.length} elemen) ${v.help}`);
    }
  }
  const reduced = await page.evaluate(() => !document.documentElement.classList.contains("motion") && document.querySelector("#pemutar") === null);
  ok(reduced, `@${width}: kelas gerak aktif padahal pengguna meminta gerak dikurangi`);

  // Interaksi konsol
  await page.goto(`${base}/#/konsol`);
  await waitView(page, "konsol");
  const verdict = () => page.locator("#verdict").innerText();
  await page.selectOption("#pilih-eksperimen", { index: 1 });
  await page.waitForURL(/exp=/);
  await waitView(page, "konsol");
  ok(page.url().includes("exp="), `konsol @${width}: pilihan rekaman tidak masuk ke URL`);
  await page.getByRole("button", { name: "Isolation Forest", exact: true }).first().click();
  await waitView(page, "konsol");
  ok(page.url().includes("model=isolation_forest"), `konsol @${width}: model tidak berubah`);
  await page.getByRole("button", { name: "Hemat alarm", exact: true }).first().click();
  await waitView(page, "konsol");
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
  await page.locator('.chart-stage[tabindex="0"]').first().focus();
  await page.keyboard.press("Home");
  const r0 = await page.locator("#keterangan-kursor").innerText();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const moved = await page
    .waitForFunction((before) => document.querySelector("#keterangan-kursor").innerText !== before, r0, { timeout: 5000 })
    .then(() => true, () => false);
  const r1 = await page.locator("#keterangan-kursor").innerText();
  const sec = (t) => Number((/Detik (\d+):/.exec(t) || [])[1]);
  ok(moved && sec(r1) > sec(r0) && sec(r1) - sec(r0) <= 15, `konsol @${width}: panah tidak menggeser penanda (${r0.slice(0, 20)} -> ${r1.slice(0, 20)})`);
  await page.screenshot({ path: join(OUT, `konsol-interaksi-${width}-gelap.png`), fullPage: true });

  // Kinerja dan kesalahan: ganti skema, model, dan batas
  await page.goto(`${base}/#/kinerja`);
  await waitView(page, "kinerja");
  const before = await page.locator("#dampak-batas").innerText();
  await page.locator("#geser-batas").fill("5");
  const changed = await page.waitForFunction((b) => document.querySelector("#dampak-batas").innerText !== b, before, { timeout: 5000 }).then(() => true, () => false);
  ok(changed, `kinerja @${width}: angka dampak batas tidak berubah`);
  await page.getByRole("button", { name: "Kembali ke batas resmi" }).click();
  const back = await page.locator("#dampak-batas").innerText();
  ok(back === before, `kinerja @${width}: kembali ke batas resmi tidak memulihkan angka`);
  ok(/0,77/.test(back), `kinerja @${width}: F1 resmi PCA mode sensitif tidak tampil (${back.replace(/\n/g, " | ")})`);
  await page.getByRole("button", { name: /Skema B/ }).click();
  await page.waitForFunction(() => document.querySelector("main caption")?.textContent.includes("Skema B"));
  await page.goto(`${base}/#/kesalahan`);
  await waitView(page, "kesalahan");
  await page.getByRole("button", { name: "Isolation Forest", exact: true }).first().click();
  await waitView(page, "kesalahan");

  // Tema terang
  await page.getByRole("button", { name: /Tema terang/ }).click();
  for (const view of VIEWS) {
    await page.goto(`${base}/#/${view}`);
    await waitView(page, view);
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

// 2. Gerak penuh: animasi masuk, indikator menu, pemutar, sinkronisasi status, dan performa.
for (const width of [1440, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark", reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  if (process.env.CPU_THROTTLE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_THROTTLE) });
  }
  const problems = [];
  watch(page, problems);
  const tag = `gerak @${width}`;

  // Animasi masuk: kartu tampil setelah terlihat, termasuk yang di bawah layar setelah digulir.
  await page.goto(`${base}/#/ringkasan`);
  await waitView(page, "ringkasan");
  ok(await page.evaluate(() => document.documentElement.classList.contains("motion")), `${tag}: kelas gerak tidak aktif`);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  });
  await page.waitForTimeout(900);
  const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => !e.classList.contains("in") || Number(getComputedStyle(e).opacity) < 0.99).length);
  ok(hidden === 0, `${tag}: ${hidden} elemen tetap tersembunyi setelah digulir`);

  // Indikator menu bergeser ke tautan aktif.
  await page.goto(`${base}/#/kinerja`);
  await waitView(page, "kinerja");
  await page.waitForTimeout(500);
  const aligned = await page.evaluate(() => {
    const ind = document.querySelector(".rail-ind").getBoundingClientRect();
    const a = document.querySelector('.rail a[aria-current="page"]').getBoundingClientRect();
    return Math.abs(ind.left - a.left) < 3 || Math.abs(ind.top - a.top) < 3;
  });
  ok(aligned, `${tag}: indikator menu tidak berada di tautan aktif`);

  // Pemutar
  const expId = "valve1/15";
  await page.goto(`${base}/#/konsol?exp=${encodeURIComponent(expId)}`);
  await waitView(page, "konsol");
  const pos = () => page.locator("#pemutar").getAttribute("data-pos").then(Number);
  const n = loadExp(expId).baris;
  ok((await pos()) === n - 1, `${tag}: sapuan awal tidak berakhir di ujung rekaman`);
  await page.locator("#putar").click();
  ok((await page.locator("#putar").getAttribute("aria-label")) === "Jeda", `${tag}: tombol tidak berubah menjadi Jeda`);
  await page.waitForTimeout(700);
  const p1 = await pos();
  ok(p1 > 0 && p1 < n - 1, `${tag}: Putar tidak menggerakkan posisi dari awal (${p1})`);
  await page.locator("#putar").click();
  const p2 = await pos();
  await page.waitForTimeout(500);
  const p3 = await pos();
  ok(p2 === p3, `${tag}: Jeda tidak menghentikan pemutaran (${p2} lalu ${p3})`);
  ok((await page.locator("#pemutar").getAttribute("data-playing")) === "false", `${tag}: status putar salah setelah jeda`);
  await page.locator('#kecepatan button[data-speed="120"]').click();
  await page.locator("#putar").click();
  await page.waitForTimeout(1000);
  const p4 = await pos();
  ok(p4 - p3 >= 60, `${tag}: kecepatan 120x terlalu lambat (${p4 - p3} detik per detik)`);
  // Performa saat memutar: hitung frame dan tugas panjang selama dua detik.
  const perf = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    let long = 0;
    const po = "PerformanceObserver" in window ? new PerformanceObserver((l) => { long += l.getEntries().length; }) : null;
    try { po?.observe({ entryTypes: ["longtask"] }); } catch { /* tidak didukung */ }
    const t0 = performance.now();
    const f = (now) => { frames++; if (now - t0 < 2000) requestAnimationFrame(f); else { po?.disconnect(); resolve({ fps: frames / ((now - t0) / 1000), long }); } };
    requestAnimationFrame(f);
  }));
  console.log(`${tag}: ${perf.fps.toFixed(0)} frame per detik, ${perf.long} tugas panjang saat memutar`);
  ok(perf.fps >= (process.env.CPU_THROTTLE ? 15 : 30), `${tag}: frame rate pemutaran rendah (${perf.fps.toFixed(1)})`);
  await page.locator("#ulang").click();
  await page.waitForTimeout(150);
  const p5 = await pos();
  ok(p5 < 200 && (await page.locator("#pemutar").getAttribute("data-playing")) === "true", `${tag}: Mulai ulang tidak kembali ke awal (${p5})`);
  await page.locator("#putar").click();

  // Sinkronisasi status dengan skor, batas, dan label: bandingkan dengan perhitungan dari data.
  for (const [id, model, mode] of [["valve1/15", "pca", "sensitif"], ["other/13", "pca", "sensitif"], ["valve2/0", "isolation_forest", "sensitif"]]) {
    await page.goto(`${base}/#/konsol?exp=${encodeURIComponent(id)}&model=${model}&mode=${mode}`);
    await waitView(page, "konsol");
    const exp = loadExp(id);
    const d = exp.model[model][mode];
    const cfg = { ambang: d.ambang, ketekunan_detik: d.ketekunan_detik, tahan_detik: d.tahan_detik };
    const res = evaluateExperiment(exp, d.skor, cfg);
    const [s0, e0] = exp.kejadian;
    const probes = [0, exp.kalibrasi_baris, s0 - 1, s0, s0 + 5, Math.floor((s0 + e0) / 2), e0, e0 + 1, exp.baris - 1, ...d.episode_alarm.flat()];
    let bad = 0;
    for (const i of probes) {
      await page.locator("#posisi").evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, i);
      const got = await page.locator("#pemutar").getAttribute("data-state");
      const want = stateAt(exp, d.skor, cfg, res, i);
      if (got !== want) { bad++; console.error(`  ${id} baris ${i}: tampil ${got}, seharusnya ${want}`); }
    }
    ok(bad === 0, `${tag}: status pemutar tidak sinkron pada ${bad} titik untuk ${id}`);
    // Saat kejadian dimulai, kartu status memakai warna peringatan.
    await page.locator("#posisi").evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, s0);
    const tone = await page.locator("#status-rekaman").getAttribute("data-tone");
    ok(["amber", "red"].includes(tone), `${tag}: kartu status tidak menyorot kejadian (${tone})`);
    const marks = await page.locator("#pemutar .mark.on").count();
    const expected = 1 + d.episode_alarm.filter(([a]) => a <= s0).length;
    ok(marks === expected, `${tag}: ${marks} penanda tampil di awal kejadian ${id}, seharusnya ${expected}`);
  }

  // Tooltip dan ganti sensor
  const svg = page.locator("#pemutar .chart-stage svg").first();
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.waitForTimeout(200);
  const tipText = await page.locator("#pemutar .tip").innerText();
  ok((await page.locator("#pemutar .tip.on").count()) === 1 && /Detik/.test(tipText) && /Skor/.test(tipText), `${tag}: tooltip tidak tampil`);
  await page.locator('.sensor-chips button[data-sensor="Temperature"]').click();
  await page.waitForTimeout(350);
  ok(/Suhu motor/.test(await svg.innerHTML()), `${tag}: ganti sensor tidak mengganti grafik`);

  // Kinerja: kurva presisi-recall dan legenda
  await page.goto(`${base}/#/kinerja`);
  await waitView(page, "kinerja");
  const toggle = page.getByRole("button", { name: /Isolation Forest, luas/ });
  await toggle.click();
  ok((await toggle.getAttribute("aria-pressed")) === "false", `${tag}: legenda kurva tidak bisa disembunyikan`);
  await toggle.click();

  // Jeda saat tab disembunyikan dan tidak ada kesalahan konsol.
  for (const p of problems) ok(false, `${tag}: ${p}`);
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} kegagalan`);
  process.exit(1);
}
console.log("Semua uji e2e lulus");
