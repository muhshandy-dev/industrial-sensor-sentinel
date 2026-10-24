// Rekaman layar singkat untuk review visual (tidak dijalankan di CI).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { startServer } from "./serve.mjs";

const dir = process.argv[2] || "video";
mkdirSync(dir, { recursive: true });
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: "dark", reducedMotion: "no-preference", recordVideo: { dir, size: vp } });
  const page = await ctx.newPage();
  await page.goto(`${base}/#/ringkasan`);
  await page.waitForTimeout(3500);
  await page.goto(`${base}/#/konsol`);
  await page.waitForSelector('#pemutar[data-intro="selesai"]');
  await page.locator('#kecepatan button[data-speed="120"]').click();
  await page.locator("#ulang").click(); // Mulai ulang langsung memutar.
  await page.locator(vp.width > 600 ? "#pemutar" : "#pemutar .chart-stage").first().evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: "instant" }));
  await page.waitForTimeout(6000);
  await page.locator("#putar").click();
  const svg = page.locator("#pemutar .chart-stage svg").first();
  const box = await svg.boundingBox();
  for (let k = 0; k <= 10; k++) { await page.mouse.move(box.x + box.width * (0.3 + k * 0.04), box.y + box.height * 0.45); await page.waitForTimeout(90); }
  await page.locator('.sensor-chips button[data-sensor="Temperature"]').click();
  await page.waitForTimeout(1200);
  await page.goto(`${base}/#/kinerja`);
  await page.waitForSelector('main[data-viz="siap"]');
  await page.waitForTimeout(1500);
  await page.locator("#geser-batas").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  for (const v of ["10", "20", "30", "40", "25"]) { await page.locator("#geser-batas").fill(v); await page.waitForTimeout(450); }
  await page.goto(`${base}/#/kesalahan`);
  await page.waitForSelector('main[data-viz="siap"]');
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2000);
  const v = page.video();
  await ctx.close();
  await v.saveAs(`${dir}/rekaman-${name}.webm`);
  await v.delete();
}
await browser.close();
server.close();
