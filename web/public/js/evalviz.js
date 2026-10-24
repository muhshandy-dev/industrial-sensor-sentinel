// Visualisasi evaluasi interaktif: kurva presisi-recall dan dampak batas alarm.
// Semua titik dihitung dari skor rekaman uji yang tersimpan. Tidak ada titik yang dikarang.
import { h, s, clear } from "./dom.js";
import { num, pct, seconds, MODEL_LABEL } from "./format.js";
import { prCurve, sweep, THRESHOLDS } from "./evaluation.js";
import { reduceMotion } from "./motion.js";

const MODELS = Object.keys(MODEL_LABEL);
const CLS = { ambang_statistik: "m1", pca: "m2", isolation_forest: "m3" };
const curveCache = new Map();
const sweepCache = new Map();

function onWidth(host, draw) {
  let last = 0;
  const ro = new ResizeObserver((ents) => {
    const w = Math.round(ents[0].contentRect.width);
    if (w && w !== last) { last = w; draw(w); }
  });
  ro.observe(host);
  return () => ro.disconnect();
}

// Animasi garis tergambar dari kiri ke kanan, sekali.
function drawIn(paths) {
  if (reduceMotion()) return;
  for (const p of paths) {
    if (!p.getTotalLength) continue;
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    const a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
    a.onfinish = () => { p.style.strokeDasharray = ""; };
  }
}

export function prPanel(exps, summary, mode) {
  const curves = Object.fromEntries(MODELS.map((m) => {
    const key = `${m}|${mode}`;
    if (!curveCache.has(key)) curveCache.set(key, prCurve(exps, m, mode));
    return [m, curveCache.get(key)];
  }));
  const visible = new Set(MODELS);
  const uji = (m) => summary.kinerja.p1_kalibrasi_awal[m][mode].uji;
  const prevalence = curves[MODELS[0]].prevalence;
  const host = h("div", { class: "chart-stage", tabindex: 0, role: "group", "aria-label": "Kurva presisi dan recall. Panah kiri dan kanan untuk menggeser penanda recall." });
  const tip = h("div", { class: "tip", "aria-hidden": "true" });
  const legend = h("div", { class: "legend", role: "group", "aria-label": "Tampilkan atau sembunyikan model" },
    MODELS.map((m) => h("button", { type: "button", "aria-pressed": "true", "data-model": m }, h("i", { class: `sw-${CLS[m]}` }), `${MODEL_LABEL[m]}, luas ${num(curves[m].ap, 2)}`)),
    h("span", null, h("i", { class: "sw-rand" }), `Tebakan acak (${num(prevalence, 2)})`));
  const note = h("p", { class: "chart-note" }, "Titik bulat: hasil akhir tiap model setelah aturan alarm, mode yang dipilih di atas. Luas di bawah kurva sama dengan PR-AUC pada tabel.");
  const panel = h("div", { class: "panel chart-wrap" }, legend, host, note);
  let cursorR = null;
  let current = null;

  const draw = (width) => {
    clear(host);
    host.append(tip);
    const W = Math.max(width - 24, 280);
    const narrow = W < 520;
    const H = narrow ? 300 : 360;
    const L = 44, R = 14, T = 12, B = 40;
    const X = (r) => L + r * (W - L - R);
    const Y = (p) => T + (1 - p) * (H - T - B);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Kurva presisi dan recall untuk tiga model pada rekaman uji." });
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(s("line", { class: "grid-line", x1: X(0), x2: X(1), y1: Y(v), y2: Y(v) }));
      svg.append(s("line", { class: "grid-line", x1: X(v), x2: X(v), y1: Y(0), y2: Y(1) }));
      svg.append(s("text", { class: "t-label", x: L - 6, y: Y(v) + 4, "text-anchor": "end" }, num(v, 2)));
      svg.append(s("text", { class: "t-label", x: X(v), y: H - B + 16, "text-anchor": "middle" }, num(v, 2)));
    }
    svg.append(s("text", { class: "t-label", x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle" }, "Cakupan anomali (recall)"));
    svg.append(s("text", { class: "t-label", x: 12, y: (T + H - B) / 2, transform: `rotate(-90 12 ${(T + H - B) / 2})`, "text-anchor": "middle" }, "Ketepatan alarm (presisi)"));
    svg.append(s("line", { class: "rand-line", x1: X(0), x2: X(1), y1: Y(prevalence), y2: Y(prevalence) }));
    const paths = [];
    for (const m of MODELS) {
      if (!visible.has(m)) continue;
      const pts = curves[m].points.map((p) => `${X(p.recall).toFixed(1)},${Y(p.precision).toFixed(1)}`);
      const pl = s("polyline", { class: `trace ${CLS[m]}`, points: `${X(0)},${Y(curves[m].points[0].precision).toFixed(1)} ${pts.join(" ")}` });
      svg.append(pl);
      paths.push(pl);
    }
    for (const m of MODELS) {
      if (!visible.has(m)) continue;
      const u = uji(m);
      const c = s("circle", { class: `op-point mark on`, cx: X(u.recall), cy: Y(u.precision), r: 6 });
      c.style.fill = `var(--${CLS[m]})`;
      c.append(s("title", null, `${MODEL_LABEL[m]}: presisi ${num(u.precision, 2)}, recall ${num(u.recall, 2)}`));
      svg.append(c);
    }
    const cross = s("line", { class: "cursor", y1: Y(1), y2: Y(0), visibility: "hidden" });
    const dots = Object.fromEntries(MODELS.map((m) => {
      const d = s("circle", { r: 4, class: "head-dot", visibility: "hidden" });
      d.style.fill = `var(--${CLS[m]})`;
      return [m, d];
    }));
    svg.append(cross, ...Object.values(dots));
    const hit = s("rect", { class: "hit", x: X(0), y: Y(1), width: X(1) - X(0), height: Y(0) - Y(1) });
    svg.append(hit);
    host.append(svg);
    if (current === null) drawIn(paths);
    current = { X, Y, W, svg, cross, dots };
    const show = (r, clientX = null, clientY = null) => {
      cursorR = Math.max(0, Math.min(1, r));
      cross.setAttribute("x1", X(cursorR)); cross.setAttribute("x2", X(cursorR)); cross.setAttribute("visibility", "visible");
      const rows = [h("div", { class: "r" }, h("span", null, "Recall"), h("b", { class: "num" }, num(cursorR, 2)))];
      for (const m of MODELS) {
        if (!visible.has(m)) { dots[m].setAttribute("visibility", "hidden"); continue; }
        // Presisi terbaik yang bisa dicapai pada recall ini atau lebih tinggi.
        let best = null;
        for (const p of curves[m].all) if (p.recall >= cursorR && (!best || p.precision > best.precision)) best = p;
        if (!best) { dots[m].setAttribute("visibility", "hidden"); continue; }
        dots[m].setAttribute("cx", X(cursorR)); dots[m].setAttribute("cy", Y(best.precision)); dots[m].setAttribute("visibility", "visible");
        rows.push(h("div", { class: "r" }, h("span", null, MODEL_LABEL[m]), h("b", { class: "num" }, `presisi ${num(best.precision, 2)}`)));
      }
      tip.replaceChildren(...rows);
      const hr = host.getBoundingClientRect();
      const sr = svg.getBoundingClientRect();
      const px = clientX != null ? clientX - hr.left : (X(cursorR) / W) * sr.width + (sr.left - hr.left);
      const py = clientY != null ? clientY - hr.top : 40;
      const tw = tip.offsetWidth || 190;
      const left = px + 14 + tw > hr.width ? px - tw - 14 : px + 14;
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(4, py - 50))}px)`;
      tip.classList.add("on");
    };
    const rOf = (clientX) => {
      const rect = svg.getBoundingClientRect();
      return (((clientX - rect.left) / rect.width) * W - L) / (W - L - R);
    };
    hit.addEventListener("pointermove", (ev) => show(rOf(ev.clientX), ev.clientX, ev.clientY));
    hit.addEventListener("pointerdown", (ev) => show(rOf(ev.clientX), ev.clientX, ev.clientY));
    svg.addEventListener("pointerleave", () => { tip.classList.remove("on"); cross.setAttribute("visibility", "hidden"); for (const d of Object.values(dots)) d.setAttribute("visibility", "hidden"); });
    host.onkeydown = (ev) => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      ev.preventDefault();
      show((cursorR ?? 0.5) + (ev.key === "ArrowRight" ? 0.02 : -0.02));
    };
    host.onblur = () => tip.classList.remove("on");
  };
  legend.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-model]");
    if (!b) return;
    const m = b.dataset.model;
    if (visible.has(m) && visible.size > 1) visible.delete(m); else visible.add(m);
    for (const x of legend.querySelectorAll("button[data-model]")) x.setAttribute("aria-pressed", String(visible.has(x.dataset.model)));
    draw(host.clientWidth);
  });
  const stop = onWidth(host, draw);
  return { el: panel, stop };
}

export function thresholdPanel(exps, summary, mode) {
  let model = "pca";
  const official = () => summary.kinerja.p1_kalibrasi_awal[model][mode];
  const getSweep = () => {
    const o = official();
    const key = `${model}|${mode}`;
    if (!sweepCache.has(key)) sweepCache.set(key, sweep(exps, model, mode, o.ketekunan_detik, o.tahan_detik));
    return sweepCache.get(key);
  };
  const officialIdx = () => THRESHOLDS.findIndex((t) => Math.abs(t - official().ambang) < 1e-9);
  let k = officialIdx();
  const segM = h("div", { class: "seg", role: "group", "aria-label": "Model untuk grafik batas alarm" },
    MODELS.map((m) => h("button", { type: "button", "aria-pressed": String(m === model), "data-model": m }, MODEL_LABEL[m])));
  const slider = h("input", { type: "range", id: "geser-batas", min: 0, max: THRESHOLDS.length - 1, step: 1, value: k });
  const out = h("output", { class: "num", for: "geser-batas" });
  const resetB = h("button", { class: "btn", type: "button" }, "Kembali ke batas resmi");
  const kF1 = h("div", { class: "v" }), kEv = h("div", { class: "v" }), kFa = h("div", { class: "v" }), kDl = h("div", { class: "v" });
  const readouts = h("div", { class: "readouts", role: "status", "aria-live": "polite", id: "dampak-batas" },
    h("div", { class: "panel kpi" }, h("div", { class: "l" }, "Skor F1"), kF1),
    h("div", { class: "panel kpi cyan" }, h("div", { class: "l" }, "Kejadian tertangkap"), kEv),
    h("div", { class: "panel kpi amber" }, h("div", { class: "l" }, "Alarm palsu per jam"), kFa),
    h("div", { class: "panel kpi" }, h("div", { class: "l" }, "Waktu sampai alarm (median)"), kDl));
  const stage = h("div", { class: "chart-stage" });
  const rulesNote = h("p", { class: "chart-note" });
  const panel = h("div", { class: "panel chart-wrap" },
    h("div", { class: "controls" },
      h("div", { class: "field" }, h("span", { class: "lab" }, "Model"), segM),
      h("div", { class: "field" }, h("label", { for: "geser-batas" }, "Batas alarm (skor)"), h("div", { class: "slider-row" }, slider, out)),
      resetB),
    readouts,
    h("div", { class: "legend" },
      h("span", null, h("i", { class: "sw-m2" }), "Skor F1"),
      h("span", null, h("i", { class: "sw-m3" }), "Kejadian tertangkap"),
      h("span", null, h("i", { class: "sw-alarm-bad" }), "Alarm palsu per jam (grafik bawah)")),
    stage,
    rulesNote);
  let geo = null;

  const fmtThr = (t) => num(t, t < 1 ? 3 : t < 10 ? 2 : 1);
  const paintSel = () => {
    const r = getSweep()[k];
    const offK = officialIdx();
    out.textContent = fmtThr(THRESHOLDS[k]);
    slider.setAttribute("aria-valuetext", `batas ${out.textContent}${k === offK ? ", batas resmi" : ""}`);
    kF1.textContent = num(r.f1, 2);
    kEv.textContent = pct(r.eventRecall * 100, 0);
    kFa.textContent = num(r.falsePerHour, 1);
    kDl.textContent = r.medianDelay == null ? "tidak ada" : seconds(r.medianDelay);
    panel.dataset.batas = String(k);
    if (geo) for (const el of geo.sel) { el.setAttribute("x1", geo.X(k)); el.setAttribute("x2", geo.X(k)); }
  };
  const draw = (width) => {
    clear(stage);
    const sw = getSweep();
    const W = Math.max(width - 24, 280);
    const narrow = W < 520;
    const L = 40, R = 14;
    const h1 = narrow ? 150 : 180, h2 = narrow ? 80 : 96;
    const T = 10, gap = 34;
    const H = T + h1 + gap + h2 + 34;
    const X = (i) => L + (i / (THRESHOLDS.length - 1)) * (W - L - R);
    const Y1 = (v) => T + (1 - v) * h1;
    const faMax = Math.max(1, ...sw.map((r) => r.falsePerHour));
    const y2top = T + h1 + gap;
    const Y2 = (v) => y2top + (1 - v / faMax) * h2;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Dampak batas alarm untuk ${MODEL_LABEL[model]} pada rekaman uji.` });
    for (const v of [0, 0.5, 1]) {
      svg.append(s("line", { class: "grid-line", x1: L, x2: W - R, y1: Y1(v), y2: Y1(v) }));
      svg.append(s("text", { class: "t-label", x: L - 6, y: Y1(v) + 4, "text-anchor": "end" }, num(v, 1)));
    }
    for (const v of [0, faMax / 2, faMax]) {
      svg.append(s("line", { class: "grid-line", x1: L, x2: W - R, y1: Y2(v), y2: Y2(v) }));
      svg.append(s("text", { class: "t-label", x: L - 6, y: Y2(v) + 4, "text-anchor": "end" }, num(v, 0)));
    }
    svg.append(s("text", { class: "t-title", x: L, y: y2top - 8 }, "Alarm palsu per jam"));
    const line = (vals, Y, cls) => s("polyline", { class: `trace ${cls}`, points: vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ") });
    const pF1 = line(sw.map((r) => r.f1), Y1, "m2");
    const pEv = line(sw.map((r) => r.eventRecall), Y1, "m3");
    const pFa = line(sw.map((r) => r.falsePerHour), Y2, "fa");
    svg.append(pF1, pEv, pFa);
    for (const t of [0.1, 1, 10, 100]) {
      const i = THRESHOLDS.findIndex((x) => x >= t - 1e-9);
      if (i < 0) continue;
      svg.append(s("text", { class: "t-label", x: X(i), y: H - 18, "text-anchor": "middle" }, num(t, t < 1 ? 1 : 0)));
    }
    svg.append(s("text", { class: "t-label", x: (L + W - R) / 2, y: H - 3, "text-anchor": "middle" }, "Batas alarm (skor, skala log)"));
    const offK = officialIdx();
    svg.append(s("line", { class: "rand-line", x1: X(offK), x2: X(offK), y1: T, y2: y2top + h2 }));
    svg.append(s("text", { class: "t-label", x: X(offK) + 4, y: T + 10 }, "batas resmi"));
    const sel1 = s("line", { class: "playhead", y1: T, y2: T + h1 });
    const sel2 = s("line", { class: "playhead", y1: y2top, y2: y2top + h2 });
    svg.append(sel1, sel2);
    const hit = s("rect", { class: "hit", x: L, y: T, width: W - L - R, height: y2top + h2 - T });
    svg.append(hit);
    const pick = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      k = Math.max(0, Math.min(THRESHOLDS.length - 1, Math.round(((px - L) / (W - L - R)) * (THRESHOLDS.length - 1))));
      slider.value = String(k);
      paintSel();
    };
    hit.addEventListener("pointerdown", (ev) => { pick(ev); hit.setPointerCapture?.(ev.pointerId); });
    hit.addEventListener("pointermove", (ev) => { if (ev.buttons) pick(ev); });
    stage.append(svg);
    geo = { X, sel: [sel1, sel2] };
    drawIn([pF1, pEv, pFa]);
    const o = official();
    rulesNote.textContent = `Aturan alarm tetap seperti hasil resmi: skor harus di atas batas selama ${o.ketekunan_detik} detik, alarm bertahan ${o.tahan_detik} detik. Dihitung dari 10 rekaman uji, Skema A. Batas resmi dipilih dari data penyetelan, bukan dari grafik ini.`;
    paintSel();
  };
  slider.addEventListener("input", () => { k = Number(slider.value); paintSel(); });
  resetB.addEventListener("click", () => { k = officialIdx(); slider.value = String(k); paintSel(); });
  segM.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-model]");
    if (!b || b.dataset.model === model) return;
    model = b.dataset.model;
    for (const x of segM.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
    k = officialIdx();
    slider.value = String(k);
    draw(stage.clientWidth);
  });
  const stop = onWidth(stage, draw);
  return { el: panel, stop };
}

// Garis waktu alarm benar, alarm palsu, dan kejadian terlewat untuk semua rekaman uji.
export function errorTimeline(exps, model, mode) {
  const wrap = h("div", { class: "panel chart-wrap", id: "garis-waktu-kesalahan" });
  wrap.append(h("div", { class: "legend" },
    h("span", null, h("i", { class: "sw-truth" }), "Kejadian sebenarnya"),
    h("span", null, h("i", { class: "sw-alarm" }), "Alarm benar"),
    h("span", null, h("i", { class: "sw-false" }), "Alarm palsu"),
    h("span", null, h("i", { class: "sw-calib" }), "Kalibrasi")));
  const list = h("div");
  wrap.append(list);
  const W = 600, Hh = 28;
  exps.forEach((exp, k) => {
    const d = exp.model[model][mode];
    const [s0, e0] = exp.kejadian;
    const n = exp.detik.length;
    const tMax = exp.detik[n - 1];
    const x = (i) => (exp.detik[Math.min(i, n - 1)] / tMax) * W;
    const eps = d.episode_alarm;
    // Sama dengan definisi evaluasi: kejadian tertangkap bila alarm menyala kapan pun selama kejadian.
    const hit = eps.some(([a, b]) => b >= s0 && a <= e0);
    const falseN = eps.filter(([a]) => !(a >= s0 && a <= e0)).length;
    const svg = s("svg", { viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: "none", role: "img", "aria-label": `${exp.id}: ${hit ? "kejadian tertangkap" : "kejadian terlewat"}, ${falseN} alarm palsu.` });
    svg.append(s("rect", { x: 0, y: 2, width: W, height: Hh - 4, class: "tl-bg" }));
    svg.append(s("rect", { x: 0, y: 2, width: x(exp.kalibrasi_baris - 1), height: Hh - 4, class: "band-calib" }));
    svg.append(s("rect", { class: "band-truth", x: x(s0), y: 2, width: Math.max(x(e0) - x(s0), 1), height: Hh - 4 }));
    if (!hit) svg.append(s("rect", { class: "band-miss", x: x(s0), y: 2, width: Math.max(x(e0) - x(s0), 1), height: Hh - 4 }));
    for (const [a, b] of eps) {
      const ok = a >= s0 && a <= e0;
      const r = s("rect", { class: `band-alarm${ok ? "" : " false"}`, x: x(a), y: 8, width: Math.max(x(b) - x(a), 2), height: Hh - 16 });
      r.append(s("title", null, `${ok ? "Alarm benar" : "Alarm palsu"}: detik ${exp.detik[a]} sampai ${exp.detik[b]}`));
      svg.append(r);
    }
    const row = h("div", { class: "tl-row", "data-reveal": Math.min(k, 8) },
      h("div", { class: "who" }, h("div", null, exp.skenario), h("div", { class: "mono" }, exp.id)),
      svg,
      h("div", { class: "res" }, h("span", { class: `chip ${hit ? "ok" : "bad"}` }, hit ? "Tertangkap" : "Terlewat"), h("div", { class: "s num" }, `${falseN} alarm palsu`)));
    list.append(row);
  });
  wrap.append(h("p", { class: "chart-note" }, "Setiap baris adalah satu rekaman uji dari awal sampai akhir. Garis merah tebal di sekitar kejadian berarti kejadian itu tidak memicu alarm. Alarm palsu yang sudah menyala sebelum kejadian dan berlanjut ke dalamnya tetap membuat kejadian dihitung tertangkap."));
  return wrap;
}
