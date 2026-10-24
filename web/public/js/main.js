import { h, s, clear } from "./dom.js";
import { loadSummary } from "./data.js";
import { renderOverview } from "./overview.js";
import { renderConsole } from "./console.js";
import { renderPerformance } from "./performance.js";
import { renderErrors } from "./errors.js";
import { renderMethod } from "./method.js";
import { reveal, enter } from "./motion.js";

const VIEWS = [
  { id: "ringkasan", label: "Ringkasan", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { id: "konsol", label: "Konsol", icon: "M3 17l5-6 4 4 5-8 4 5" },
  { id: "kinerja", label: "Kinerja", icon: "M5 20V10M12 20V4M19 20v-7" },
  { id: "kesalahan", label: "Kesalahan", icon: "M12 3l10 18H2zM12 10v5M12 18v.5" },
  { id: "metode", label: "Metode", icon: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" },
];
const DEFAULTS = { model: "pca", mode: "sensitif", scheme: "p1_kalibrasi_awal", exp: null, thr: null, per: null, tah: null };

const main = document.getElementById("utama");
const menu = document.getElementById("menu");
let summary;
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const q = new URLSearchParams(query);
  const state = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (!q.has(k)) continue;
    const v = q.get(k);
    state[k] = ["thr"].includes(k) ? Number(v) : ["per", "tah"].includes(k) ? Number(v) : v;
  }
  const view = VIEWS.some((v) => v.id === path) ? path : "ringkasan";
  return { view, state };
}

function setState(patch) {
  const { view, state } = parseHash();
  const next = { ...state, ...patch };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v != null && v !== DEFAULTS[k]) q.set(k, String(v));
  }
  const qs = q.toString();
  main.removeAttribute("data-ready");
  location.hash = `#/${view}${qs ? `?${qs}` : ""}`;
}

// Menu dibuat sekali. Indikator aktif bergeser ke tautan yang dipilih.
const links = h("div", { class: "rail-links" });
const indicator = h("span", { class: "rail-ind", "aria-hidden": "true" });
function buildMenu() {
  clear(menu);
  links.append(indicator);
  for (const v of VIEWS) {
    const icon = s("svg", { class: "ic", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, s("path", { d: v.icon }));
    links.append(h("a", { href: `#/${v.id}`, "data-view": v.id }, icon, h("span", null, v.label)));
  }
  menu.append(h("div", { class: "rail-inner" },
    h("p", { class: "rail-head" }, "Navigasi"),
    links,
    h("div", { class: "rail-foot" }, h("strong", null, "Data SKAB"), h("br"), "Rig pompa air laboratorium. Hasil batch, bukan pemantauan langsung."),
  ));
}
function markActive(active) {
  let el = null;
  for (const a of links.querySelectorAll("a")) {
    const on = a.dataset.view === active;
    if (on) { a.setAttribute("aria-current", "page"); el = a; } else a.removeAttribute("aria-current");
  }
  placeIndicator(el);
}
function placeIndicator(el) {
  if (!el) return;
  const horizontal = getComputedStyle(links).flexDirection === "row";
  if (horizontal) {
    indicator.style.width = `${el.offsetWidth}px`;
    indicator.style.height = "";
    indicator.style.transform = `translateX(${el.offsetLeft}px)`;
  } else {
    indicator.style.width = "";
    indicator.style.height = `${el.offsetHeight}px`;
    indicator.style.transform = `translateY(${el.offsetTop}px)`;
  }
  requestAnimationFrame(() => indicator.classList.add("ready"));
}
window.addEventListener("resize", () => placeIndicator(links.querySelector('[aria-current="page"]')));
buildMenu();

async function render() {
  const { view, state } = parseHash();
  markActive(view);
  if (cleanup) { cleanup(); cleanup = null; }
  if (!summary) {
    try {
      summary = await loadSummary();
    } catch (err) {
      clear(main);
      main.append(h("p", { class: "empty" }, "Data hasil belum bisa dimuat. Muat ulang halaman ini."));
      return;
    }
  }
  if (!state.exp) state.exp = summary.eksperimen.find((e) => e.id === "valve1/15")?.id ?? summary.eksperimen[0].id;
  document.title = `${VIEWS.find((v) => v.id === view).label} | Industrial Sensor Sentinel`;
  if (view === "ringkasan") renderOverview(main, summary);
  else if (view === "konsol") cleanup = await renderConsole(main, summary, state, setState);
  else if (view === "kinerja") cleanup = renderPerformance(main, summary, state, setState);
  else if (view === "kesalahan") renderErrors(main, summary, state, setState);
  else renderMethod(main, summary);
  if (view !== "konsol") main.dataset.ready = view;
  reveal(main);
}

let lastView = null;
window.addEventListener("hashchange", async () => {
  const { view } = parseHash();
  await render();
  if (view !== lastView) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); enter(main); }
  lastView = view;
});

// Tema
const themeBtn = document.getElementById("tema");
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  themeBtn.textContent = t === "dark" ? "Tema terang" : "Tema gelap";
  themeBtn.setAttribute("aria-pressed", String(t === "light"));
}
let stored = null;
try { stored = localStorage.getItem("tema"); } catch { /* penyimpanan bisa diblokir */ }
applyTheme(stored || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
themeBtn.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("tema", next); } catch { /* abaikan */ }
});

lastView = parseHash().view;
render();
