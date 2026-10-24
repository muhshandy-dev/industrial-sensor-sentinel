import { h, s, clear } from "./dom.js";
import { num, pct, seconds, MODEL_LABEL } from "./format.js";
import { loadExperiment } from "./data.js";
import { evaluateExperiment } from "./logic.js";
import { reduceMotion } from "./motion.js";

const HERO_EXP = "other/14";
const HERO_MODEL = "pca";
const HERO_MODE = "sensitif";
const symlog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v));
const arrow = () => s("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, s("path", { d: "M5 12h14M13 6l6 6-6 6" }));

export function renderOverview(root, summary) {
  clear(root);
  const p = summary.profil;
  const a = summary.kinerja.p1_kalibrasi_awal;
  const models = Object.keys(MODEL_LABEL);
  const sens = models.map((m) => ({ m, r: a[m].sensitif.uji }));
  const best = [...sens].sort((x, y) => y.r.f1 - x.r.f1)[0];
  const test = summary.pembagian.test.length;
  const delays = sens.map((x) => x.r.tunda_deteksi_median_detik).filter((d) => d != null);
  const caught = sens.map((x) => x.r.recall_kejadian);

  const heroCard = h("div", { class: "panel hero-card", "data-reveal": 1 }, h("p", { class: "loading" }, "Memuat rekaman contoh"));
  root.append(
    h("section", { class: "hero" },
      h("div", { "data-reveal": 0 },
        h("p", { class: "eyebrow" }, "Deteksi anomali dan peringatan dini sensor industri"),
        h("h1", null, "Industrial Sensor Sentinel"),
        h("p", { class: "lead" }, "Model mempelajari kondisi normal pompa air dari delapan sensor, lalu menyalakan alarm saat polanya berubah. Semua angka dinilai pada rekaman yang tidak pernah dipakai untuk melatih model."),
        h("div", { class: "cta-row" },
          h("a", { class: "btn primary", href: "#/konsol" }, "Putar rekaman sensor", arrow()),
          h("a", { class: "btn", href: "#/kinerja" }, "Lihat kinerja model"),
        ),
      ),
      heroCard,
    ),
    h("div", { class: "notice", role: "note", "data-reveal": 2 },
      s("svg", { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "aria-hidden": "true", focusable: "false" }, s("circle", { cx: 12, cy: 12, r: 9 }), s("path", { d: "M12 8v5M12 16.5v.5" })),
      h("p", null, "Halaman ini memutar ulang hasil perhitungan dari rekaman yang tersimpan. Tidak ada sensor yang terhubung, dan ini bukan pemantauan langsung atau pemeliharaan prediktif.")),
    h("div", { class: "grid k4" },
      kpi("Rekaman uji coba", num(p.eksperimen_berlabel, 0), `${num(p.total_baris_berlabel, 0)} pengukuran, sekitar satu per detik`, "", 0),
      kpi("Rekaman untuk penilaian akhir", num(test, 0), "Tidak dipakai untuk melatih atau menyetel model", "cyan", 1),
      kpi("Kejadian yang tertangkap", `${pct(Math.min(...caught) * 100, 0)} sampai ${pct(Math.max(...caught) * 100, 0)}`, "Pada rekaman uji, tergantung model, mode sensitif", "", 2),
      kpi("Waktu sampai alarm", `${num(Math.min(...delays), 0)} sampai ${num(Math.max(...delays), 0)} detik`, "Median sejak anomali dimulai, mode sensitif", "amber", 3),
    ),
    h("h2", null, "Mulai dari mana"),
    h("div", { class: "grid k3" },
      card("#/konsol", "Pemutar rekaman", "Putar ulang satu rekaman dan lihat kapan alarm menyala dibandingkan kejadian sebenarnya.", 0),
      card("#/kinerja", "Kinerja model", "Bandingkan tiga cara deteksi dan lihat dampak menggeser batas alarm.", 1),
      card("#/kesalahan", "Analisis kesalahan", "Lihat kejadian yang terlewat dan kapan alarm palsu muncul.", 2),
    ),
    h("h2", null, "Temuan utama"),
    h("div", { class: "grid two" }, findings(summary, best).map((t, i) => h("div", { class: "panel finding", "data-reveal": i }, h("span", { class: "k" }, `0${i + 1}`), h("p", null, t)))),
    h("h2", null, "Seberapa yakin hasil ini?"),
    h("ul", { class: "clean" },
      h("li", null, `Penilaian akhir hanya memakai ${test} rekaman dengan satu kejadian masing-masing. Satu kejadian terlewat sudah mengubah hasil 10 persen.`),
      h("li", null, "Semua data berasal dari satu alat uji di laboratorium. Belum terbukti berlaku untuk mesin lain di pabrik."),
      h("li", null, "Peringatan dini berarti alarm menyala tak lama setelah perubahan dimulai. Ini bukan ramalan kerusakan."),
    ),
    h("h2", null, "Cara membaca hasil"),
    h("ul", { class: "clean" },
      h("li", null, "Setiap rekaman berisi satu gangguan yang sengaja dibuat, misalnya katup ditutup. Waktunya sudah ditandai oleh pembuat data."),
      h("li", null, "Alarm dianggap benar hanya bila mulai menyala saat gangguan berlangsung. Alarm yang menyala lebih awal dihitung palsu, walau kejadiannya tetap dihitung tertangkap bila alarm itu masih menyala."),
      h("li", null, "Model belajar tanpa diberi tahu mana yang gangguan. Tanda gangguan hanya dipakai untuk memilih batas alarm pada rekaman lama."),
    ),
  );
  heroChart(heroCard, summary);
}

async function heroChart(host, summary) {
  const entry = summary.eksperimen.find((e) => e.id === HERO_EXP) || summary.eksperimen[0];
  let exp;
  try { exp = await loadExperiment(entry); } catch { clear(host); host.append(h("p", { class: "empty" }, "Rekaman contoh belum bisa dimuat.")); return; }
  const d = exp.model[HERO_MODEL][HERO_MODE];
  const cfg = { ambang: d.ambang, ketekunan_detik: d.ketekunan_detik, tahan_detik: d.tahan_detik };
  const res = evaluateExperiment(exp, d.skor, cfg);
  const small = window.matchMedia("(max-width: 600px)").matches;
  const W = small ? 380 : 560, H = small ? 220 : 230, L = 10, R = 10, T = 30, laneH = 14;
  const tMax = exp.detik[exp.detik.length - 1];
  const x = (t) => L + (t / tMax) * (W - L - R);
  const sTop = T + laneH * 2 + 14, sBot = H - 24;
  const top = symlog(Math.max(2, ...d.skor, cfg.ambang * 1.2));
  const bottom = symlog(Math.min(-0.5, ...d.skor));
  const y = (v) => sBot - ((symlog(v) - bottom) / (top - bottom)) * (sBot - sTop);
  const [s0, e0] = exp.kejadian;
  const clipId = "hero-clip";
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Contoh rekaman ${exp.id}: skor model ${MODEL_LABEL[HERO_MODEL]} naik saat kejadian dan memicu alarm.` });
  const clipRect = s("rect", { x: 0, y: 0, width: W, height: H });
  svg.append(s("defs", null, s("clipPath", { id: clipId }, clipRect)));
  svg.append(s("rect", { class: "band-calib", x: x(0), y: T, width: x(exp.detik[exp.kalibrasi_baris - 1]) - x(0), height: sBot - T }));
  svg.append(s("text", { class: "t-label", x: x(0) + 4, y: T - 8 }, "Kalibrasi"));
  const band = s("rect", { class: "band-truth mark", x: x(exp.detik[s0]), y: T, width: x(exp.detik[e0]) - x(exp.detik[s0]), height: laneH });
  svg.append(band, s("text", { class: "t-title", x: x(exp.detik[s0]) + 4, y: T - 8 }, "Kejadian sebenarnya"));
  for (const tick of [0, 1, 10, 100]) {
    if (symlog(tick) > top) continue;
    svg.append(s("line", { class: "grid-line", x1: L, x2: W - R, y1: y(tick), y2: y(tick) }));
  }
  const pts = exp.detik.map((t, i) => `${x(t).toFixed(1)},${y(d.skor[i]).toFixed(1)}`).join(" ");
  svg.append(s("polyline", { class: "trace score reveal-ghost", points: pts }));
  const g = s("g", { "clip-path": `url(#${clipId})` });
  g.append(s("polygon", { class: "area-score", points: `${x(0)},${sBot} ${pts} ${x(tMax)},${sBot}` }));
  g.append(s("polyline", { class: "trace score", points: pts }));
  for (const [a2, b2] of res.episodes) {
    const ok = a2 >= s0 && a2 <= e0;
    g.append(s("rect", { class: `band-alarm${ok ? "" : " false"}`, x: x(exp.detik[a2]), y: T + laneH + 4, width: Math.max(x(exp.detik[b2]) - x(exp.detik[a2]), 2), height: laneH - 4, rx: 2 }));
  }
  svg.append(g);
  svg.append(s("line", { class: "thr-line", x1: L, x2: W - R, y1: y(cfg.ambang), y2: y(cfg.ambang) }));
  svg.append(s("text", { class: "t-label", x: W - R - 2, y: y(cfg.ambang) - 5, "text-anchor": "end" }, "batas alarm"));
  const first = res.episodes.find(([a2]) => a2 >= s0 && a2 <= e0);
  const pin = first ? s("circle", { class: "mark mark-ok", cx: x(exp.detik[first[0]]), cy: T + laneH + 9, r: 5 }) : null;
  if (pin) svg.append(pin);
  const head = s("line", { class: "playhead", x1: 0, x2: 0, y1: T, y2: sBot });
  svg.append(head);
  svg.append(s("text", { class: "t-label", x: L, y: H - 6 }, "0 detik"));
  svg.append(s("text", { class: "t-label", x: W - R, y: H - 6, "text-anchor": "end" }, `${num(tMax, 0)} detik`));

  const caption = res.detected
    ? `Alarm menyala ${seconds(res.delay)} setelah kejadian dimulai${res.falseEpisodes ? `, dengan ${res.falseEpisodes} alarm palsu` : ", tanpa alarm palsu"}.`
    : "Kejadian ini tidak memicu alarm.";
  const replay = h("button", { class: "btn ghost", type: "button" }, "Putar ulang");
  clear(host);
  host.append(
    h("div", { class: "head" },
      h("h3", null, `Contoh: ${exp.skenario}`),
      h("span", { class: "badge" }, h("span", { class: "dot" }), `${MODEL_LABEL[HERO_MODEL]}, rekaman ${exp.id}`)),
    svg,
    h("div", { class: "head" }, h("p", { class: "chart-note" }, caption), replay),
  );

  let raf = 0;
  const setT = (t) => {
    const px = x(t);
    clipRect.setAttribute("width", Math.max(0, px));
    head.setAttribute("x1", px); head.setAttribute("x2", px);
    band.classList.toggle("on", t >= exp.detik[s0]);
    if (pin) pin.classList.toggle("on", t >= exp.detik[first[0]]);
  };
  const play = () => {
    cancelAnimationFrame(raf);
    if (reduceMotion()) { setT(tMax); head.setAttribute("visibility", "hidden"); return; }
    head.setAttribute("visibility", "visible");
    const dur = 2600;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - k) ** 2;
      setT(eased * tMax);
      if (k < 1 && host.isConnected) raf = requestAnimationFrame(step);
      else head.setAttribute("visibility", "hidden");
    };
    raf = requestAnimationFrame(step);
  };
  replay.addEventListener("click", play);
  if (reduceMotion()) replay.hidden = true;
  play();
}

function findings(summary, best) {
  const a = summary.kinerja.p1_kalibrasi_awal;
  const b = summary.kinerja.p2_riwayat_normal;
  const models = Object.keys(MODEL_LABEL);
  const f = (x, m, mode) => x[m][mode].uji.f1;
  const lo = Math.min(...models.map((m) => f(a, m, "sensitif")));
  const hi = Math.max(...models.map((m) => f(a, m, "sensitif")));
  const out = [];
  out.push(`Ketiga model mendapat skor F1 ${num(lo, 2)} sampai ${num(hi, 2)} (skala 0 sampai 1). Tertinggi: ${MODEL_LABEL[best.m]}, tetapi rentang ketidakpastiannya bertumpuk, jadi belum ada pemenang yang jelas.`);
  const pc = summary.perbandingan_berpasangan["p1_kalibrasi_awal|sensitif|pca_dikurangi_ambang_statistik"];
  if (pc) out.push(`Cara paling sederhana, ambang statistik, hampir sama baiknya dengan model yang lebih rumit. Keunggulan PCA hanya ${num(pc.selisih_f1, 2)} poin skor F1.`);
  const drop = f(a, "pca", "sensitif") - f(b, "pca", "sensitif");
  out.push(`Kalibrasi ulang di awal pemantauan lebih andal daripada memakai model lama. Model yang belajar dari rekaman sebelumnya turun ${num(drop, 2)} poin (PCA) karena kondisi mesin berubah.`);
  out.push("Mode hemat alarm mengurangi alarm palsu, tetapi sebagian gangguan kecil tidak lagi tertangkap.");
  return out;
}

function kpi(l, v, sub, tone, i) {
  return h("div", { class: `panel kpi lift ${tone}`, "data-reveal": i }, h("div", { class: "l" }, l), h("div", { class: "v" }, v), h("div", { class: "s" }, sub));
}
function card(href, title, text, i) {
  return h("a", { class: "panel pad lift", href, "data-reveal": i }, h("h3", null, title), h("p", { class: "s" }, text), h("span", { class: "go" }, "Buka", arrow()));
}
