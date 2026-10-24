import { h, s, clear } from "./dom.js";
import { loadExperiment } from "./data.js";
import { evaluateExperiment, f1 } from "./logic.js";
import { num, pct, seconds, MODEL_LABEL, MODE_LABEL } from "./format.js";

const THR_MIN = 0.05;
const THR_MAX = 100;
const sliderToThr = (v) => Math.exp(Math.log(THR_MIN) + (v / 1000) * (Math.log(THR_MAX) - Math.log(THR_MIN)));
const thrToSlider = (t) => Math.round(((Math.log(t) - Math.log(THR_MIN)) / (Math.log(THR_MAX) - Math.log(THR_MIN))) * 1000);
const symlog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v));

export async function renderConsole(root, summary, state, setState) {
  clear(root);
  root.append(
    h("p", { class: "eyebrow" }, "Konsol pemantauan"),
    h("h1", null, "Lihat kapan model memberi peringatan"),
    h("p", { class: "lead" }, "Pilih satu rekaman uji, lalu bandingkan peringatan model dengan kejadian sebenarnya. Skor dihitung satu kali di Python (hasil batch). Ambang dan aturan alarm dihitung ulang di browser Anda saat Anda menggesernya."),
  );

  const entries = summary.eksperimen;
  const entry = entries.find((e) => e.id === state.exp) || entries[0];
  const exp = await loadExperiment(entry);

  const modeData = () => exp.model[state.model][state.mode];
  const defaults = () => {
    const m = modeData();
    return { ambang: m.ambang, ketekunan_detik: m.ketekunan_detik, tahan_detik: m.tahan_detik };
  };
  let cfg = {
    ambang: state.thr ?? defaults().ambang,
    ketekunan_detik: state.per ?? defaults().ketekunan_detik,
    tahan_detik: state.tah ?? defaults().tahan_detik,
  };

  // Kontrol
  const sel = h("select", { id: "pilih-eksperimen" }, entries.map((e) => h("option", { value: e.id, selected: e.id === entry.id }, `${e.skenario} (rekaman ${e.id})`)));
  sel.addEventListener("change", () => setState({ exp: sel.value, thr: null, per: null, tah: null }));

  const seg = (name, values, labels, current, key) => {
    const g = h("div", { class: "seg", role: "group", "aria-label": name });
    for (const v of values) {
      g.append(h("button", { type: "button", "aria-pressed": String(v === current), onclick: () => setState({ [key]: v, thr: null, per: null, tah: null }) }, labels[v]));
    }
    return g;
  };

  const thrOut = h("output", { class: "num", for: "sl-ambang" });
  const perOut = h("output", { class: "num", for: "sl-ketekunan" });
  const holdOut = h("output", { class: "num", for: "sl-tahan" });
  const slThr = h("input", { id: "sl-ambang", type: "range", min: 0, max: 1000, value: thrToSlider(cfg.ambang), "aria-valuetext": "" });
  const slPer = h("input", { id: "sl-ketekunan", type: "range", min: 1, max: 60, value: cfg.ketekunan_detik });
  const slHold = h("input", { id: "sl-tahan", type: "range", min: 0, max: 120, value: cfg.tahan_detik });
  const resetBtn = h("button", { class: "btn", type: "button", onclick: () => {
    cfg = defaults();
    slThr.value = thrToSlider(cfg.ambang);
    slPer.value = cfg.ketekunan_detik;
    slHold.value = cfg.tahan_detik;
    update();
  } }, "Kembalikan ke nilai hasil penyetelan");
  const tunedChip = h("span", { class: "chip mute" });

  const controls = h("div", { class: "panel controls" },
    h("div", { class: "field" }, h("label", { for: "pilih-eksperimen" }, "Rekaman uji"), sel),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Model"), seg("Model", Object.keys(MODEL_LABEL), MODEL_LABEL, state.model, "model")),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Mode"), seg("Mode", Object.keys(MODE_LABEL), MODE_LABEL, state.mode, "mode")),
  );
  const tune = h("div", { class: "panel controls" },
    h("div", { class: "field" }, h("label", { for: "sl-ambang" }, "Ambang skor"), h("div", { class: "slider-row" }, slThr, thrOut)),
    h("div", { class: "field" }, h("label", { for: "sl-ketekunan" }, "Harus melewati ambang berturut-turut (detik)"), h("div", { class: "slider-row" }, slPer, perOut)),
    h("div", { class: "field" }, h("label", { for: "sl-tahan" }, "Alarm bertahan setelah skor turun (detik)"), h("div", { class: "slider-row" }, slHold, holdOut)),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Status pengaturan"), tunedChip),
    resetBtn,
  );
  root.append(controls, tune);

  const verdict = h("div", { class: "grid k4", id: "verdict", role: "status", "aria-live": "polite" });
  const chartHost = h("div", { class: "panel chart-wrap" });
  const readout = h("div", { class: "readout", "aria-live": "off", id: "keterangan-kursor" });
  const timelineHost = h("div");
  root.append(verdict, h("h2", null, "Grafik waktu"), chartHost, readout, h("h2", null, "Garis waktu peringatan"), timelineHost);

  let rafId = 0;
  const update = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const scores = modeData().skor;
      const res = evaluateExperiment(exp, scores, cfg);
      const base = defaults();
      const same = Math.abs(cfg.ambang - base.ambang) < 1e-9 && cfg.ketekunan_detik === base.ketekunan_detik && cfg.tahan_detik === base.tahan_detik;
      tunedChip.textContent = same ? "Sesuai hasil penyetelan" : "Diubah manual";
      tunedChip.className = `chip ${same ? "ok" : "warn"}`;
      thrOut.textContent = num(cfg.ambang, cfg.ambang < 1 ? 2 : 1);
      perOut.textContent = `${cfg.ketekunan_detik} dtk`;
      holdOut.textContent = `${cfg.tahan_detik} dtk`;
      slThr.setAttribute("aria-valuetext", `ambang ${thrOut.textContent}`);
      drawVerdict(verdict, res);
      drawChart(chartHost, readout, exp, scores, cfg, res, summary);
      drawTimeline(timelineHost, exp, res);
    });
  };

  slThr.addEventListener("input", () => { cfg = { ...cfg, ambang: sliderToThr(Number(slThr.value)) }; update(); });
  slPer.addEventListener("input", () => { cfg = { ...cfg, ketekunan_detik: Number(slPer.value) }; update(); });
  slHold.addEventListener("input", () => { cfg = { ...cfg, tahan_detik: Number(slHold.value) }; update(); });
  const ro = new ResizeObserver(() => update());
  ro.observe(chartHost);
  update();
  return () => { ro.disconnect(); cancelAnimationFrame(rafId); };
}

function stat(label, value, sub, cls = "") {
  return h("div", { class: `panel stat ${cls}` }, h("div", { class: "l" }, label), h("div", { class: "v" }, value), h("div", { class: "s" }, sub));
}

function drawVerdict(host, r) {
  clear(host);
  const prec = r.tp + r.fp ? r.tp / (r.tp + r.fp) : 0;
  const rec = r.tp + r.fn ? r.tp / (r.tp + r.fn) : 0;
  const perHour = r.normalHours ? r.falseEpisodes / r.normalHours : 0;
  host.append(
    stat("Kejadian sebenarnya", r.detected ? "Terdeteksi" : "Terlewat", r.detected ? "Ada alarm yang menyala saat kejadian" : "Tidak ada alarm saat kejadian", r.detected ? "good" : "bad"),
    stat("Tunda deteksi", r.delay == null ? "tidak ada" : seconds(r.delay), "Sejak kejadian dimulai sampai alarm pertama"),
    stat("Alarm palsu", `${r.falseEpisodes} kali`, `${num(perHour, 1)} per jam waktu normal`, r.falseEpisodes ? "bad" : "good"),
    stat("Skor F1 rekaman ini", num(f1(r), 2), `Presisi ${pct(prec * 100, 0)}, recall ${pct(rec * 100, 0)}`),
  );
}

function drawTimeline(host, exp, r) {
  clear(host);
  const [s0, e0] = exp.kejadian;
  const rows = r.episodes.map(([a, b]) => {
    const ok = a >= s0 && a <= e0;
    return h("tr", null,
      h("td", { class: "n" }, `${exp.detik[a]} detik`),
      h("td", { class: "n" }, `${exp.detik[b] - exp.detik[a] + 1} detik`),
      h("td", null, h("span", { class: `chip ${ok ? "ok" : "bad"}` }, ok ? "Alarm sah" : "Alarm palsu")),
      h("td", null, a < s0 ? "Sebelum kejadian" : a > e0 ? "Setelah kejadian" : "Saat kejadian"),
    );
  });
  host.append(
    h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
      h("caption", null, `Kejadian sebenarnya berlangsung dari detik ${exp.detik[s0]} sampai ${exp.detik[e0]}. Waktu dihitung dari awal rekaman.`),
      h("thead", null, h("tr", null, h("th", { class: "n" }, "Mulai"), h("th", { class: "n" }, "Lama"), h("th", null, "Status"), h("th", null, "Posisi"))),
      h("tbody", null, rows.length ? rows : h("tr", null, h("td", { colspan: 4, class: "empty" }, "Tidak ada alarm pada pengaturan ini."))),
    )),
  );
}

function drawChart(host, readout, exp, scores, cfg, res, summary) {
  clear(host);
  const W = Math.max(host.clientWidth - 24, 280);
  const narrow = W < 520;
  const padL = 8, padR = narrow ? 8 : 14;
  const pw = W - padL - padR;
  const tMax = exp.detik[exp.detik.length - 1];
  const x = (t) => padL + (t / tMax) * pw;
  const laneH = 20;
  const scoreH = narrow ? 96 : 120;
  const stripH = narrow ? 50 : 56;
  const sensors = summary.sensor;
  let y = 0;
  const geo = {};
  geo.truth = [y, laneH]; y += laneH + 4;
  geo.alarm = [y, laneH]; y += laneH + 10;
  geo.score = [y, scoreH]; y += scoreH + 10;
  geo.strips = sensors.map((_, i) => [y + i * (stripH + 6), stripH]);
  y += sensors.length * (stripH + 6);
  const axisY = y + 2;
  const H = axisY + 38;

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Grafik waktu rekaman ${exp.id}: skor model, kejadian sebenarnya, peringatan, dan ${sensors.length} sensor.` });
  const [s0, e0] = exp.kejadian;
  const tS = exp.detik[s0], tE = exp.detik[e0];
  const tCal = exp.detik[exp.kalibrasi_baris - 1];

  // Latar kalibrasi dan kejadian di seluruh tinggi
  svg.append(s("rect", { class: "band-calib", x: x(0), y: 0, width: x(tCal) - x(0), height: axisY }));
  svg.append(s("text", { class: "t-label", x: x(0) + 4, y: geo.truth[0] + 14 }, narrow ? "Kalibrasi" : "Kalibrasi (normal)"));

  // Lajur kebenaran
  svg.append(s("rect", { class: "band-truth", x: x(tS), y: geo.truth[0], width: Math.max(x(tE) - x(tS), 1), height: laneH }));
  svg.append(s("text", { class: "t-title", x: x(tS) + 6, y: geo.truth[0] + 14 }, narrow ? "Kejadian" : "Kejadian sebenarnya"));
  // Lajur alarm
  svg.append(s("line", { class: "grid-line", x1: padL, x2: padL + pw, y1: geo.alarm[0] + laneH, y2: geo.alarm[0] + laneH }));
  for (const [a, b] of res.episodes) {
    const ok = a >= s0 && a <= e0;
    svg.append(s("rect", { class: `band-alarm${ok ? "" : " false"}`, x: x(exp.detik[a]), y: geo.alarm[0] + 2, width: Math.max(x(exp.detik[b]) - x(exp.detik[a]), 2), height: laneH - 4 }));
  }
  svg.append(s("text", { class: "t-title", x: padL + pw - 4, y: geo.alarm[0] + 14, "text-anchor": "end" }, narrow ? "Alarm" : "Peringatan model"));

  // Skor (skala log simetris)
  const [sy0, sh] = geo.score;
  const maxS = Math.max(2, ...scores.map((v) => v));
  const top = symlog(Math.max(maxS, cfg.ambang * 1.2));
  const bottom = symlog(Math.min(-0.5, Math.min(...scores)));
  const ys = (v) => sy0 + sh - ((symlog(v) - bottom) / (top - bottom)) * sh;
  for (const tick of [0, 1, 10, 100]) {
    if (symlog(tick) > top || symlog(tick) < bottom) continue;
    svg.append(s("line", { class: "grid-line", x1: padL, x2: padL + pw, y1: ys(tick), y2: ys(tick) }));
    svg.append(s("text", { class: "t-label", x: padL + 2, y: ys(tick) - 3 }, String(tick)));
  }
  svg.append(s("text", { class: "t-title", x: padL + pw - 4, y: sy0 + 12, "text-anchor": "end" }, narrow ? "Skor (log)" : "Skor anomali (skala log)"));
  svg.append(s("polyline", { class: "trace score", points: exp.detik.map((t, i) => `${x(t).toFixed(1)},${ys(scores[i]).toFixed(1)}`).join(" ") }));
  svg.append(s("line", { class: "thr-line", x1: padL, x2: padL + pw, y1: ys(cfg.ambang), y2: ys(cfg.ambang) }));
  svg.append(s("text", { class: "t-label", x: padL + pw - 4, y: ys(cfg.ambang) - 4, "text-anchor": "end" }, "ambang"));

  // Sensor
  sensors.forEach((sen, i) => {
    const [y0, hh] = geo.strips[i];
    const vals = exp.sensor[sen.id];
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
    const padv = (mx - mn) * 0.08;
    mn -= padv; mx += padv;
    const yv = (v) => y0 + hh - ((v - mn) / (mx - mn)) * hh;
    svg.append(s("rect", { x: padL, y: y0, width: pw, height: hh, fill: "none", class: "grid-line" }));
    svg.append(s("polyline", { class: "trace", points: vals.map((v, k) => `${x(exp.detik[k]).toFixed(1)},${yv(v).toFixed(1)}`).join(" ") }));
    svg.append(s("text", { class: "t-title", x: padL + 6, y: y0 + 13 }, `${sen.label} (${sen.satuan})`));
    svg.append(s("text", { class: "t-label", x: padL + pw - 4, y: y0 + 12, "text-anchor": "end" }, num(mx - padv, 2)));
    svg.append(s("text", { class: "t-label", x: padL + pw - 4, y: y0 + hh - 4, "text-anchor": "end" }, num(mn + padv, 2)));
  });

  // Sumbu waktu
  const step = niceStep(tMax / (narrow ? 4 : 8));
  for (let t = 0; t <= tMax; t += step) {
    svg.append(s("line", { class: "grid-line", x1: x(t), x2: x(t), y1: axisY, y2: axisY + 4 }));
    svg.append(s("text", { class: "t-label", x: x(t), y: axisY + 16, "text-anchor": "middle" }, `${t}`));
  }
  svg.append(s("text", { class: "t-label", x: padL + pw / 2, y: axisY + 31, "text-anchor": "middle" }, "Waktu sejak awal rekaman (detik)"));

  // Kursor
  const cursor = s("line", { class: "cursor", x1: 0, x2: 0, y1: 0, y2: axisY, visibility: "hidden" });
  svg.append(cursor);
  const idxAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const t = ((clientX - rect.left) / rect.width * W - padL) / pw * tMax;
    let lo = 0, hi = exp.detik.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (exp.detik[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  let cur = Math.min(exp.kalibrasi_baris + 1, exp.detik.length - 1);
  const show = (i) => {
    cur = Math.max(0, Math.min(exp.detik.length - 1, i));
    cursor.setAttribute("x1", x(exp.detik[cur]));
    cursor.setAttribute("x2", x(exp.detik[cur]));
    cursor.setAttribute("visibility", "visible");
    const inEvent = cur >= s0 && cur <= e0;
    const on = res.flags[cur];
    readout.textContent = `Detik ${exp.detik[cur]}: skor ${num(scores[cur], 2)}, alarm ${on ? "menyala" : "mati"}, kejadian sebenarnya ${inEvent ? "berlangsung" : "tidak berlangsung"}. ` +
      sensors.map((sen) => `${sen.label} ${num(exp.sensor[sen.id][cur], 2)} ${sen.satuan}`).join(", ") + ".";
  };
  svg.addEventListener("pointermove", (ev) => show(idxAt(ev.clientX)));
  svg.addEventListener("pointerdown", (ev) => show(idxAt(ev.clientX)));
  host.setAttribute("tabindex", "0");
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "Grafik waktu. Gunakan panah kiri dan kanan untuk memindahkan penanda waktu.");
  host.onkeydown = (ev) => {
    const d = ev.shiftKey ? 30 : 5;
    if (ev.key === "ArrowRight") { show(cur + d); ev.preventDefault(); }
    else if (ev.key === "ArrowLeft") { show(cur - d); ev.preventDefault(); }
    else if (ev.key === "Home") { show(0); ev.preventDefault(); }
    else if (ev.key === "End") { show(exp.detik.length - 1); ev.preventDefault(); }
  };

  host.append(
    h("div", { class: "legend" },
      h("span", null, h("i", { class: "sw-truth" }), "Kejadian sebenarnya (label SKAB)"),
      h("span", null, h("i", { class: "sw-alarm" }), "Alarm sah"),
      h("span", null, h("i", { class: "sw-false" }), "Garis putus-putus: alarm palsu"),
      h("span", null, h("i", { class: "sw-calib" }), "Kalibrasi awal, tidak dinilai"),
    ),
    svg,
    h("p", { class: "chart-note" }, `Kalibrasi memakai ${summary.kalibrasi_awal_detik} detik pertama rekaman. Tiap sensor memakai skala sendiri.`),
  );
  show(cur);
}

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}
