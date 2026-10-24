// Pemutar rekaman: memutar ulang skor dan sensor dari rekaman SKAB yang tersimpan.
// Bukan pemantauan langsung. Status alarm dihitung dari skor, batas alarm, dan label asli.
import { h, s, clear } from "./dom.js";
import { loadExperiment } from "./data.js";
import { evaluateExperiment, f1 } from "./logic.js";
import { stateAt } from "./evaluation.js";
import { num, pct, seconds, MODEL_LABEL, MODE_LABEL } from "./format.js";
import { accordion, reduceMotion } from "./motion.js";

const THR_MIN = 0.05;
const THR_MAX = 100;
const sliderToThr = (v) => Math.exp(Math.log(THR_MIN) + (v / 1000) * (Math.log(THR_MAX) - Math.log(THR_MIN)));
const thrToSlider = (t) => Math.round(((Math.log(t) - Math.log(THR_MIN)) / (Math.log(THR_MAX) - Math.log(THR_MIN))) * 1000);
const symlog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v));
const SPEEDS = [10, 30, 60, 120];

// Pilihan yang bertahan saat berganti rekaman atau model.
const session = { speed: 60, sensor: null };
let clipSeq = 0;

const icon = (d, size = 20) => s("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "currentColor", "aria-hidden": "true", focusable: "false" }, s("path", { d }));
const ICON_PLAY = "M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z";
const ICON_PAUSE = "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";
const ICON_RESTART = "M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z";

export async function renderConsole(root, summary, state, setState) {
  clear(root);
  root.append(
    h("header", { class: "page-head" },
      h("h1", null, "Pemutar rekaman"),
      h("p", { class: "lead" }, "Putar ulang satu rekaman uji dan lihat kapan alarm menyala dibanding kejadian sebenarnya. Skor dihitung sebelumnya dari rekaman tersimpan, jadi ini bukan pemantauan langsung.")),
  );

  const entries = summary.eksperimen;
  const entry = entries.find((e) => e.id === state.exp) || entries[0];
  const exp = await loadExperiment(entry);
  const n = exp.detik.length;
  const [s0, e0] = exp.kejadian;
  const sensors = summary.sensor;
  const errKey = `p1_kalibrasi_awal|${state.model}|${state.mode}`;
  const errRow = summary.analisis_kesalahan?.[errKey]?.per_eksperimen.find((r) => r.eksperimen === exp.id);
  const mostShifted = errRow?.sensor_paling_bergeser;
  const sensorLabel = (id) => sensors.find((x) => x.id === id)?.label ?? id;
  let focusId = session.sensor && sensors.some((x) => x.id === session.sensor) ? session.sensor : mostShifted || sensors[0].id;

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
  let res = evaluateExperiment(exp, modeData().skor, cfg);

  // Pilihan rekaman, model, mode
  const sel = h("select", { id: "pilih-eksperimen" }, entries.map((e) => h("option", { value: e.id, selected: e.id === entry.id }, `${e.skenario} (rekaman ${e.id})`)));
  sel.addEventListener("change", () => setState({ exp: sel.value, thr: null, per: null, tah: null }));
  const seg = (name, values, labels, current, key) => h("div", { class: "seg", role: "group", "aria-label": name },
    values.map((v) => h("button", { type: "button", "aria-pressed": String(v === current), onclick: () => setState({ [key]: v, thr: null, per: null, tah: null }) }, labels[v])));
  root.append(h("div", { class: "panel controls" },
    h("div", { class: "field" }, h("label", { for: "pilih-eksperimen" }, "Rekaman uji"), sel),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Model"), seg("Model", Object.keys(MODEL_LABEL), MODEL_LABEL, state.model, "model")),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Mode"), seg("Mode", Object.keys(MODE_LABEL), MODE_LABEL, state.mode, "mode")),
  ));

  // Pemutar
  const playBtn = h("button", { class: "btn play-btn", type: "button", id: "putar", "aria-label": "Putar", title: "Putar" }, icon(ICON_PLAY));
  const restartBtn = h("button", { class: "btn icon-btn", type: "button", id: "ulang", "aria-label": "Mulai ulang dari awal", title: "Mulai ulang" }, icon(ICON_RESTART, 18));
  const jumpBtn = h("button", { class: "btn", type: "button", id: "ke-kejadian" }, "Ke awal kejadian");
  const speedSeg = h("div", { class: "seg", role: "group", "aria-label": "Kecepatan putar", id: "kecepatan" },
    SPEEDS.map((v) => h("button", { type: "button", "aria-pressed": String(v === session.speed), "data-speed": v }, `${v}x`)));
  const timeOut = h("span", { class: "time num", "aria-live": "off" });
  const scrubInput = h("input", { type: "range", id: "posisi", min: 0, max: n - 1, step: 1, value: n - 1, "aria-label": "Posisi rekaman" });
  const track = h("div", { class: "scrub-track", "aria-hidden": "true" });
  const done = h("i", { class: "t-done" });
  const pctOf = (i) => `${(exp.detik[Math.min(i, n - 1)] / exp.detik[n - 1]) * 100}%`;
  const placeBar = (el, a, b) => { el.style.left = pctOf(a); el.style.width = `calc(${pctOf(b)} - ${pctOf(a)})`; };
  const drawTrack = () => {
    clear(track);
    const calib = h("i", { class: "t-calib" }); placeBar(calib, 0, exp.kalibrasi_baris - 1);
    const ev = h("i", { class: "t-event" }); placeBar(ev, s0, e0);
    track.append(calib, ev);
    for (const [a, b] of res.episodes) {
      const ok = a >= s0 && a <= e0;
      const t = h("i", { class: `t-alarm${ok ? "" : " false"}` });
      placeBar(t, a, b);
      t.style.minWidth = "2px";
      track.append(t);
    }
    track.append(done);
  };
  const statusCard = h("div", { class: "status-card", id: "status-rekaman", role: "status", "aria-live": "polite" },
    h("span", { class: "lamp", "aria-hidden": "true" }),
    h("div", null, h("div", { class: "st" }), h("p", { class: "ex" })));
  const stage = h("div", { class: "chart-stage", tabindex: 0, role: "group", "aria-label": "Grafik rekaman. Spasi untuk putar atau jeda, panah kiri dan kanan untuk menggeser waktu.", "aria-describedby": "keterangan-kursor" });
  const tip = h("div", { class: "tip", "aria-hidden": "true" });
  const chips = h("div", { class: "sensor-chips", role: "group", "aria-label": "Sensor yang ditampilkan" },
    h("span", { class: "lab" }, "Sensor:"),
    sensors.map((x) => h("button", { type: "button", "aria-pressed": String(x.id === focusId), "data-sensor": x.id }, x.label)));
  const readout = h("p", { class: "readout", id: "keterangan-kursor", "aria-live": "off" });
  const player = h("section", { class: "panel player", id: "pemutar", "aria-label": "Pemutar rekaman", "data-state": "", "data-pos": "" },
    h("div", { class: "player-bar" }, playBtn, restartBtn, speedSeg, jumpBtn, h("span", { class: "spacer" }), timeOut),
    h("div", { class: "scrub" }, track, scrubInput),
    h("div", { class: "scrub-legend" },
      h("span", null, h("i", { class: "sw-calib" }), "Kalibrasi"),
      h("span", null, h("i", { class: "sw-truth" }), "Kejadian sebenarnya"),
      h("span", null, h("i", { class: "sw-alarm" }), "Alarm benar"),
      h("span", null, h("i", { class: "sw-alarm-bad" }), "Alarm palsu")),
    statusCard,
    stage,
    chips,
    h("div", { class: "chart-stage" }, readout),
  );
  root.append(player);

  const verdict = h("div", { class: "grid k4", id: "verdict", role: "status", "aria-live": "polite" });
  root.append(h("h2", null, "Hasil untuk seluruh rekaman"), verdict);

  // Pengaturan alarm
  const thrOut = h("output", { class: "num", for: "sl-ambang" });
  const perOut = h("output", { class: "num", for: "sl-ketekunan" });
  const holdOut = h("output", { class: "num", for: "sl-tahan" });
  const slThr = h("input", { id: "sl-ambang", type: "range", min: 0, max: 1000, value: thrToSlider(cfg.ambang), "aria-valuetext": "" });
  const slPer = h("input", { id: "sl-ketekunan", type: "range", min: 1, max: 60, value: cfg.ketekunan_detik });
  const slHold = h("input", { id: "sl-tahan", type: "range", min: 0, max: 120, value: cfg.tahan_detik });
  const tunedChip = h("span", { class: "chip mute" });
  const resetBtn = h("button", { class: "btn", type: "button" }, "Kembalikan ke nilai hasil penyetelan");
  root.append(accordion("Atur batas alarm", "Geser untuk melihat dampaknya. Hasil dihitung ulang di browser dari skor yang tersimpan.", h("div", { class: "controls" },
    h("div", { class: "field" }, h("label", { for: "sl-ambang" }, "Batas alarm (skor)"), h("div", { class: "slider-row" }, slThr, thrOut)),
    h("div", { class: "field" }, h("label", { for: "sl-ketekunan" }, "Skor harus di atas batas selama (detik)"), h("div", { class: "slider-row" }, slPer, perOut)),
    h("div", { class: "field" }, h("label", { for: "sl-tahan" }, "Alarm bertahan setelah skor turun (detik)"), h("div", { class: "slider-row" }, slHold, holdOut)),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Status pengaturan"), tunedChip),
    resetBtn,
  ), { open: true, id: "atur-alarm" }));

  const stripsHost = h("div", { class: "chart-wrap" });
  const stripsAcc = accordion("Delapan sensor sekaligus", "Semua sensor pada rekaman ini, masing-masing dengan skala sendiri.", stripsHost, { id: "semua-sensor" });
  root.append(stripsAcc);
  const timelineHost = h("div");
  root.append(accordion("Daftar alarm", "Setiap alarm pada rekaman ini dan apakah alarm itu benar.", timelineHost, { open: true, id: "daftar-alarm" }));

  // Keadaan pemutaran
  let idx = n - 1;
  let tSec = exp.detik[n - 1];
  let playing = false;
  let raf = 0;
  let lastFrame = 0;
  let lastState = "";
  let chart = null;
  let strips = null;
  let lastWidth = 0;
  let intro = 0;

  const indexAt = (t) => {
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (exp.detik[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };

  const statusText = (st, i) => {
    const pers = cfg.ketekunan_detik;
    const sc = exp.skenario;
    const sen = mostShifted ? ` Sensor yang paling berubah: ${sensorLabel(mostShifted)}.` : "";
    switch (st) {
      case "kalibrasi": return ["Kalibrasi", `Model mempelajari kondisi normal dari ${summary.kalibrasi_awal_detik} detik pertama. Bagian ini tidak dinilai.`, "mute"];
      case "normal": return ["Normal", "Skor di bawah batas alarm dan tidak ada kejadian yang ditandai pada saat ini.", "ok"];
      case "naik": return ["Skor di atas batas", `Skor sudah melewati batas, tetapi alarm baru menyala setelah ${pers} detik berturut-turut.`, "amber"];
      case "kejadian": return ["Kejadian berlangsung, alarm belum menyala", `Menurut label rekaman: ${sc.toLowerCase()}.${sen}`, "amber"];
      case "alarm-benar": {
        const ep = res.episodes.find(([a, b]) => i >= a && i <= b);
        const lag = ep ? exp.detik[ep[0]] - exp.detik[s0] : res.delay;
        return ["Alarm menyala, kejadian tertangkap", `Alarm mulai ${seconds(lag)} setelah kejadian dimulai. Kejadian: ${sc.toLowerCase()}.${sen}`, "red"];
      }
      case "alarm-palsu": {
        if (i >= s0 && i <= e0) return ["Alarm menyala, tetapi mulai sebelum kejadian", "Alarm ini sudah menyala sebelum label kejadian dimulai, jadi dihitung satu alarm palsu. Karena alarm tetap menyala selama kejadian, kejadian dihitung tertangkap dengan waktu 0 detik.", "red"];
        return ["Alarm palsu", i > e0 ? "Alarm menyala setelah kejadian selesai. Label sudah normal, tetapi sensor mungkin belum pulih." : "Alarm menyala saat label menunjukkan kondisi normal.", "red"];
      }
      case "terlewat": return ["Kejadian terlewat", "Kejadian pada rekaman ini sudah selesai tanpa memicu alarm.", "amber"];
      default: return ["", "", "mute"];
    }
  };

  const paint = (i, fromScrub = false) => {
    idx = Math.max(0, Math.min(n - 1, i));
    const scores = modeData().skor;
    if (chart) chart.paint(idx);
    if (strips) strips.paint(idx);
    if (!fromScrub) scrubInput.value = String(idx);
    done.style.transform = `scaleX(${exp.detik[idx] / exp.detik[n - 1]})`;
    timeOut.replaceChildren(h("b", null, `Detik ${num(exp.detik[idx], 0)}`), ` dari ${num(exp.detik[n - 1], 0)}`);
    scrubInput.setAttribute("aria-valuetext", `detik ${exp.detik[idx]}`);
    player.dataset.pos = String(idx);
    const st = stateAt(exp, scores, cfg, res, idx);
    if (st !== lastState) {
      const [title, text, tone] = statusText(st, idx);
      statusCard.dataset.tone = tone;
      statusCard.querySelector(".st").textContent = `${title}`;
      statusCard.querySelector(".ex").textContent = text;
      statusCard.classList.remove("pulse");
      if (lastState && (st.startsWith("alarm") || st === "kejadian")) { void statusCard.offsetWidth; statusCard.classList.add("pulse"); }
      player.dataset.state = st;
      lastState = st;
    }
    readout.textContent = `Detik ${exp.detik[idx]}: skor ${num(scores[idx], 2)}, alarm ${res.flags[idx] ? "menyala" : "mati"}, kejadian sebenarnya ${idx >= s0 && idx <= e0 ? "berlangsung" : "tidak berlangsung"}. ` +
      sensors.map((sen) => `${sen.label} ${num(exp.sensor[sen.id][idx], 2)} ${sen.satuan}`).join(", ") + ".";
  };

  const setPlaying = (on) => {
    playing = on;
    player.dataset.playing = String(on);
    playBtn.replaceChildren(icon(on ? ICON_PAUSE : ICON_PLAY));
    playBtn.setAttribute("aria-label", on ? "Jeda" : "Putar");
    playBtn.title = on ? "Jeda" : "Putar";
    cancelAnimationFrame(raf);
    if (on) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  const tick = (now) => {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    tSec += dt * session.speed;
    const end = exp.detik[n - 1];
    if (tSec >= end) { tSec = end; paint(n - 1); setPlaying(false); return; }
    const i = indexAt(tSec);
    if (i !== idx) paint(i);
    raf = requestAnimationFrame(tick);
  };
  const stopIntro = () => {
    if (intro) cancelAnimationFrame(intro);
    intro = 0;
    player.dataset.intro = "selesai";
    statusCard.setAttribute("aria-live", "polite");
  };
  const seek = (i) => { stopIntro(); tSec = exp.detik[Math.max(0, Math.min(n - 1, i))]; paint(i); };

  playBtn.addEventListener("click", () => {
    stopIntro();
    if (playing) { setPlaying(false); return; }
    if (idx >= n - 1) { tSec = 0; paint(0); }
    setPlaying(true);
  });
  restartBtn.addEventListener("click", () => { stopIntro(); tSec = 0; paint(0); setPlaying(true); });
  jumpBtn.addEventListener("click", () => { setPlaying(false); seek(Math.max(exp.kalibrasi_baris, s0 - 20)); });
  speedSeg.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-speed]");
    if (!b) return;
    session.speed = Number(b.dataset.speed);
    for (const x of speedSeg.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
  });
  scrubInput.addEventListener("input", () => { setPlaying(false); stopIntro(); tSec = exp.detik[Number(scrubInput.value)]; paint(Number(scrubInput.value), true); });
  chips.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-sensor]");
    if (!b || b.dataset.sensor === focusId) return;
    focusId = b.dataset.sensor;
    session.sensor = focusId;
    for (const x of chips.querySelectorAll("button[data-sensor]")) x.setAttribute("aria-pressed", String(x === b));
    if (chart) chart.setSensor(focusId);
    paint(idx);
  });
  stage.addEventListener("keydown", (ev) => {
    const d = ev.shiftKey ? 30 : 5;
    if (ev.key === " " || ev.key === "k") { ev.preventDefault(); playBtn.click(); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); setPlaying(false); seek(idx + d); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); setPlaying(false); seek(idx - d); }
    else if (ev.key === "Home") { ev.preventDefault(); setPlaying(false); seek(0); }
    else if (ev.key === "End") { ev.preventDefault(); setPlaying(false); seek(n - 1); }
  });
  stripsAcc.addEventListener("toggle", () => {
    if (!stripsAcc.open) return;
    strips = drawStrips(stripsHost, exp, summary);
    strips.paint(idx);
  });
  const onVisibility = () => { if (document.hidden && playing) setPlaying(false); };
  document.addEventListener("visibilitychange", onVisibility);

  const redrawChart = () => {
    chart = drawChart(stage, tip, exp, modeData().skor, cfg, res, summary, focusId, (i) => { setPlaying(false); seek(i); });
    if (stripsAcc.open) strips = drawStrips(stripsHost, exp, summary);
    paint(idx);
  };

  const update = () => {
    const base = defaults();
    const same = Math.abs(cfg.ambang - base.ambang) < 1e-9 && cfg.ketekunan_detik === base.ketekunan_detik && cfg.tahan_detik === base.tahan_detik;
    tunedChip.textContent = same ? "Sesuai hasil penyetelan" : "Diubah manual";
    tunedChip.className = `chip ${same ? "ok" : "warn"}`;
    thrOut.textContent = num(cfg.ambang, cfg.ambang < 1 ? 2 : 1);
    perOut.textContent = `${cfg.ketekunan_detik} dtk`;
    holdOut.textContent = `${cfg.tahan_detik} dtk`;
    slThr.setAttribute("aria-valuetext", `batas alarm ${thrOut.textContent}`);
    res = evaluateExperiment(exp, modeData().skor, cfg);
    lastState = "";
    drawVerdict(verdict, res);
    drawTrack();
    redrawChart();
    drawTimeline(timelineHost, exp, res);
    root.dataset.ready = "konsol";
  };
  let pending = 0;
  const schedule = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(update); };
  slThr.addEventListener("input", () => { cfg = { ...cfg, ambang: sliderToThr(Number(slThr.value)) }; schedule(); });
  slPer.addEventListener("input", () => { cfg = { ...cfg, ketekunan_detik: Number(slPer.value) }; schedule(); });
  slHold.addEventListener("input", () => { cfg = { ...cfg, tahan_detik: Number(slHold.value) }; schedule(); });
  resetBtn.addEventListener("click", () => {
    cfg = defaults();
    slThr.value = thrToSlider(cfg.ambang);
    slPer.value = cfg.ketekunan_detik;
    slHold.value = cfg.tahan_detik;
    schedule();
  });

  const ro = new ResizeObserver((ents) => {
    const w = Math.round(ents[0].contentRect.width);
    if (w !== lastWidth) { lastWidth = w; if (chart) redrawChart(); }
  });
  ro.observe(stage);
  lastWidth = Math.round(stage.clientWidth);
  setPlaying(false);
  update();

  // Grafik masuk bertahap: sapuan singkat dari awal ke akhir rekaman, sekali.
  if (!reduceMotion()) {
    player.dataset.intro = "berjalan";
    statusCard.setAttribute("aria-live", "off");
    const t0 = performance.now();
    const dur = 1400;
    const sweep = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      const i = Math.round(e * (n - 1));
      tSec = exp.detik[i];
      paint(i);
      if (k < 1) intro = requestAnimationFrame(sweep);
      else stopIntro();
    };
    intro = requestAnimationFrame(sweep);
  } else {
    player.dataset.intro = "selesai";
  }

  return () => {
    ro.disconnect();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(intro);
    cancelAnimationFrame(pending);
    document.removeEventListener("visibilitychange", onVisibility);
  };
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
    stat("Kejadian sebenarnya", r.detected ? "Tertangkap" : "Terlewat", r.detected ? "Alarm menyala selama kejadian berlangsung" : "Tidak ada alarm selama kejadian", r.detected ? "good" : "bad"),
    stat("Waktu sampai alarm", r.delay == null ? "tidak ada" : seconds(r.delay), "Sejak kejadian dimulai sampai alarm pertama"),
    stat("Alarm palsu", `${r.falseEpisodes} kali`, `${num(perHour, 1)} per jam waktu normal`, r.falseEpisodes ? "bad" : "good"),
    stat("Skor F1 rekaman ini", num(f1(r), 2), `Ketepatan alarm ${pct(prec * 100, 0)}, cakupan anomali ${pct(rec * 100, 0)}`),
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
      h("td", null, h("span", { class: `chip ${ok ? "ok" : "bad"}` }, ok ? "Alarm benar" : "Alarm palsu")),
      h("td", null, a < s0 ? "Sebelum kejadian" : a > e0 ? "Setelah kejadian" : "Saat kejadian"),
    );
  });
  host.append(
    h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
      h("caption", null, `Kejadian sebenarnya berlangsung dari detik ${exp.detik[s0]} sampai ${exp.detik[e0]}. Waktu dihitung dari awal rekaman.`),
      h("thead", null, h("tr", null, h("th", { class: "n", scope: "col" }, "Mulai"), h("th", { class: "n", scope: "col" }, "Lama"), h("th", { scope: "col" }, "Status"), h("th", { scope: "col" }, "Posisi"))),
      h("tbody", null, rows.length ? rows : h("tr", null, h("td", { colspan: 4, class: "empty" }, "Tidak ada alarm pada pengaturan ini."))),
    )),
  );
}

// Grafik utama: lajur kejadian dan alarm, skor model, dan satu sensor pilihan.
// Bagian yang sudah diputar digambar tegas, sisanya samar. Penanda muncul saat dilewati.
function drawChart(host, tip, exp, scores, cfg, res, summary, focusId, onSeek) {
  clear(host);
  host.append(tip);
  const W = Math.max(host.clientWidth - 24, 280);
  const narrow = W < 560;
  // Kolom kiri khusus untuk nama lajur dan angka sumbu, supaya tidak menimpa garis data.
  const padL = narrow ? 46 : 64, padR = narrow ? 6 : 10;
  const pw = W - padL - padR;
  const n = exp.detik.length;
  const tMax = exp.detik[n - 1];
  const x = (t) => padL + (t / tMax) * pw;
  const gx = padL - 8;
  const laneH = 16;
  const scoreH = narrow ? 96 : 128;
  const sensH = narrow ? 84 : 112;
  const yTruth = 6, yAlarm = yTruth + laneH + 6;
  const yScoreTitle = yAlarm + laneH + 26;
  const yScore = yScoreTitle + 10;
  const ySensTitle = yScore + scoreH + 30;
  const ySens = ySensTitle + 10;
  const axisY = ySens + sensH + 6;
  const H = axisY + (narrow ? 22 : 36);
  const [s0, e0] = exp.kejadian;
  const tS = exp.detik[s0], tE = exp.detik[e0];
  const tCal = exp.detik[exp.kalibrasi_baris - 1];
  const sensors = summary.sensor;
  const clipId = `pemutar-klip-${++clipSeq}`;

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Grafik rekaman ${exp.id}: kejadian sebenarnya, alarm model, skor, dan sensor pilihan.` });
  const clipRect = s("rect", { x: 0, y: 0, width: W, height: H });
  svg.append(s("defs", null, s("clipPath", { id: clipId }, clipRect)));
  const clipped = () => s("g", { "clip-path": `url(#${clipId})` });
  const gutter = (y, text, cls = "t-label") => svg.append(s("text", { class: cls, x: gx, y, "text-anchor": "end", "dominant-baseline": "middle" }, text));

  svg.append(s("rect", { class: "band-calib", x: x(0), y: yTruth, width: x(tCal) - x(0), height: axisY - yTruth }));
  // Lajur kejadian dan alarm
  svg.append(s("rect", { class: "lane-bg", x: padL, y: yTruth, width: pw, height: laneH }));
  svg.append(s("rect", { class: "lane-bg", x: padL, y: yAlarm, width: pw, height: laneH }));
  gutter(yTruth + laneH / 2, narrow ? "Label" : "Kejadian", "t-lane");
  gutter(yAlarm + laneH / 2, "Alarm", "t-lane");
  svg.append(s("rect", { class: "band-truth reveal-ghost", x: x(tS), y: yTruth, width: Math.max(x(tE) - x(tS), 1), height: laneH }));
  const lanes = clipped();
  lanes.append(s("rect", { class: "band-truth", x: x(tS), y: yTruth, width: Math.max(x(tE) - x(tS), 1), height: laneH }));
  for (const [a, b] of res.episodes) {
    const ok = a >= s0 && a <= e0;
    lanes.append(s("rect", { class: `band-alarm${ok ? "" : " false"}`, x: x(exp.detik[a]), y: yAlarm + 3, width: Math.max(x(exp.detik[b]) - x(exp.detik[a]), 2), height: laneH - 6, rx: 1.5 }));
  }
  svg.append(lanes);

  // Skor
  const maxS = Math.max(2, ...scores);
  const top = symlog(Math.max(maxS, cfg.ambang * 1.2));
  const bottom = symlog(Math.min(-0.5, ...scores));
  const ys = (v) => yScore + scoreH - ((symlog(v) - bottom) / (top - bottom)) * scoreH;
  svg.append(s("text", { class: "t-title", x: padL, y: yScoreTitle }, narrow ? "Skor anomali" : "Skor anomali (skala log, makin tinggi makin tidak normal)"));
  // Keterangan garis batas di baris judul, bukan di atas garis data
  const thrKey = s("g", { transform: `translate(${padL + pw}, ${yScoreTitle - 4})` });
  thrKey.append(s("line", { class: "thr-line", x1: -112, x2: -92, y1: 0, y2: 0 }));
  thrKey.append(s("text", { class: "t-label", x: 0, y: 4, "text-anchor": "end" }, `batas alarm ${num(cfg.ambang, cfg.ambang < 1 ? 3 : 1)}`));
  svg.append(thrKey);
  svg.append(s("rect", { class: "plot-frame", x: padL, y: yScore, width: pw, height: scoreH }));
  let lastY = Infinity;
  for (const tick of [0, 1, 10, 100, 1000, 10000]) {
    if (symlog(tick) > top) continue;
    const yy = ys(tick);
    svg.append(s("line", { class: "grid-line", x1: padL, x2: padL + pw, y1: yy, y2: yy }));
    if (Math.abs(lastY - yy) >= 12) { gutter(yy, num(tick, 0)); lastY = yy; }
  }
  const scorePts = exp.detik.map((t, i) => `${x(t).toFixed(1)},${ys(scores[i]).toFixed(1)}`).join(" ");
  svg.append(s("polyline", { class: "trace score reveal-ghost", points: scorePts, fill: "none" }));
  const scoreG = clipped();
  scoreG.append(s("polygon", { class: "area-score", points: `${x(0)},${yScore + scoreH} ${scorePts} ${x(tMax)},${yScore + scoreH}` }));
  scoreG.append(s("polyline", { class: "trace score", points: scorePts, fill: "none" }));
  svg.append(scoreG);
  svg.append(s("line", { class: "thr-line", x1: padL, x2: padL + pw, y1: ys(cfg.ambang), y2: ys(cfg.ambang) }));

  // Sensor pilihan
  const sensG = s("g");
  svg.append(sensG);
  let sensVals = [];
  let yv = () => 0;
  const drawSensor = (id) => {
    clear(sensG);
    const sen = sensors.find((q) => q.id === id) || sensors[0];
    sensVals = exp.sensor[sen.id];
    let mn = Math.min(...sensVals), mx = Math.max(...sensVals);
    if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
    const pad = (mx - mn) * 0.08;
    const lo = mn - pad, hi = mx + pad;
    yv = (v) => ySens + sensH - ((v - lo) / (hi - lo)) * sensH;
    sensG.append(s("rect", { class: "plot-frame", x: padL, y: ySens, width: pw, height: sensH }));
    sensG.append(s("text", { class: "t-title", x: padL, y: ySensTitle }, `${sen.label} (${sen.satuan})`));
    for (const [v, yy] of [[mx, yv(mx)], [mn, yv(mn)]]) {
      sensG.append(s("line", { class: "grid-line", x1: padL, x2: padL + pw, y1: yy, y2: yy }));
      sensG.append(s("text", { class: "t-label", x: gx, y: yy, "text-anchor": "end", "dominant-baseline": "middle" }, num(v, Math.abs(v) >= 100 ? 0 : 2)));
    }
    const pts = exp.detik.map((t, i) => `${x(t).toFixed(1)},${yv(sensVals[i]).toFixed(1)}`).join(" ");
    sensG.append(s("polyline", { class: "trace focus reveal-ghost", points: pts, fill: "none" }));
    const g = clipped();
    g.append(s("polyline", { class: "trace focus", points: pts, fill: "none" }));
    sensG.append(g);
  };
  drawSensor(focusId);

  // Penanda kejadian dan alarm, muncul saat dilewati
  const marks = [];
  const evMark = s("path", { class: "mark mark-truth", d: `M${x(tS)} ${yTruth + laneH / 2 - 5}l5 5-5 5-5-5z` });
  marks.push({ el: evMark, at: s0 });
  svg.append(evMark);
  for (const [a] of res.episodes) {
    const ok = a >= s0 && a <= e0;
    const m = s("circle", { class: `mark ${ok ? "mark-ok" : "mark-bad"}`, cx: x(exp.detik[a]), cy: yAlarm + laneH / 2, r: 4.5 });
    marks.push({ el: m, at: a });
    svg.append(m);
  }

  // Sumbu waktu
  const step = niceStep(tMax / (narrow ? 3 : 8));
  for (let t = 0; t <= tMax; t += step) {
    svg.append(s("line", { class: "grid-line", x1: x(t), x2: x(t), y1: axisY, y2: axisY + 4 }));
    const anchor = t === 0 ? "start" : x(t) > W - 20 ? "end" : "middle";
    svg.append(s("text", { class: "t-label", x: x(t), y: axisY + 16, "text-anchor": anchor }, `${t}`));
  }
  if (!narrow) svg.append(s("text", { class: "t-label", x: padL + pw / 2, y: axisY + 31, "text-anchor": "middle" }, "Waktu sejak awal rekaman (detik)"));
  else gutter(axisY + 12, "detik");

  // Kepala putar
  const glow = s("line", { class: "playhead-glow", y1: yTruth, y2: axisY });
  const line = s("line", { class: "playhead", y1: yTruth, y2: axisY });
  const dotScore = s("circle", { class: "head-dot", r: 4.5 });
  const dotSens = s("circle", { class: "head-dot", r: 4.5 });
  svg.append(glow, line, dotScore, dotSens);

  // Kursor penunjuk untuk tooltip
  const hover = s("line", { class: "cursor", y1: yTruth, y2: axisY, visibility: "hidden" });
  svg.append(hover);
  const idxAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const t = (((clientX - rect.left) / rect.width) * W - padL) / pw * tMax;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (exp.detik[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const sensorMeta = () => sensors.find((q) => q.id === focusId) || sensors[0];
  const showTip = (ev) => {
    const i = idxAt(ev.clientX);
    const px = x(exp.detik[i]);
    hover.setAttribute("x1", px); hover.setAttribute("x2", px); hover.setAttribute("visibility", "visible");
    const sen = sensorMeta();
    const inEvent = i >= s0 && i <= e0;
    tip.replaceChildren(
      h("div", { class: "r" }, h("span", null, "Detik"), h("b", { class: "num" }, String(exp.detik[i]))),
      h("div", { class: "r" }, h("span", null, sen.label), h("b", { class: "num" }, `${num(exp.sensor[sen.id][i], 2)} ${sen.satuan}`)),
      h("div", { class: "r" }, h("span", null, "Skor"), h("b", { class: "num" }, num(scores[i], 2))),
      h("div", { class: "r" }, h("span", null, "Alarm"), h("b", null, res.flags[i] ? "menyala" : "mati")),
      h("div", { class: "r" }, h("span", null, "Label"), h("b", null, i < exp.kalibrasi_baris ? "kalibrasi" : inEvent ? "kejadian" : "normal")),
    );
    const hostRect = host.getBoundingClientRect();
    const rel = ev.clientX - hostRect.left;
    const tw = tip.offsetWidth || 190;
    const left = rel + 14 + tw > hostRect.width ? rel - tw - 14 : rel + 14;
    const top = Math.max(4, ev.clientY - hostRect.top - 60);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tip.classList.add("on");
  };
  svg.addEventListener("pointermove", showTip);
  svg.addEventListener("pointerleave", () => { tip.classList.remove("on"); hover.setAttribute("visibility", "hidden"); });
  svg.addEventListener("pointerdown", (ev) => { onSeek(idxAt(ev.clientX)); showTip(ev); });

  host.append(svg);

  const paint = (i) => {
    const px = x(exp.detik[i]);
    clipRect.setAttribute("width", Math.max(0, px));
    for (const el of [glow, line]) { el.setAttribute("x1", px); el.setAttribute("x2", px); }
    dotScore.setAttribute("cx", px); dotScore.setAttribute("cy", ys(scores[i]));
    dotSens.setAttribute("cx", px); dotSens.setAttribute("cy", yv(sensVals[i]));
    for (const m of marks) m.el.classList.toggle("on", i >= m.at);
  };
  const setSensor = (id) => {
    focusId = id;
    drawSensor(id);
    if (!reduceMotion() && sensG.animate) sensG.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  };
  return { paint, setSensor };
}

// Delapan sensor kecil dengan klip yang sama dengan posisi putar.
function drawStrips(host, exp, summary) {
  clear(host);
  const W = Math.max(host.clientWidth - 24, 280);
  const n = exp.detik.length;
  const tMax = exp.detik[n - 1];
  const padL = 8, padR = 12, pw = W - padL - padR;
  const x = (t) => padL + (t / tMax) * pw;
  const stripH = W < 520 ? 48 : 56;
  const sensors = summary.sensor;
  const H = sensors.length * (stripH + 22) + 8;
  const clipId = `strip-klip-${++clipSeq}`;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Delapan sensor pada rekaman ${exp.id}.` });
  const clipRect = s("rect", { x: 0, y: 0, width: W, height: H });
  svg.append(s("defs", null, s("clipPath", { id: clipId }, clipRect)));
  const [s0, e0] = exp.kejadian;
  sensors.forEach((sen, k) => {
    const y0 = 18 + k * (stripH + 22);
    const vals = exp.sensor[sen.id];
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
    const yv = (v) => y0 + stripH - ((v - mn) / (mx - mn)) * stripH;
    svg.append(s("rect", { class: "band-truth reveal-ghost", x: x(exp.detik[s0]), y: y0, width: x(exp.detik[e0]) - x(exp.detik[s0]), height: stripH }));
    svg.append(s("text", { class: "t-title", x: padL, y: y0 - 5 }, `${sen.label} (${sen.satuan})`));
    const pts = exp.detik.map((t, i) => `${x(t).toFixed(1)},${yv(vals[i]).toFixed(1)}`).join(" ");
    svg.append(s("polyline", { class: "trace reveal-ghost", points: pts, fill: "none" }));
    const g = s("g", { "clip-path": `url(#${clipId})` });
    g.append(s("polyline", { class: "trace", points: pts, fill: "none" }));
    svg.append(g);
  });
  host.append(svg);
  return { paint: (i) => clipRect.setAttribute("width", Math.max(0, x(exp.detik[i]))) };
}

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}
