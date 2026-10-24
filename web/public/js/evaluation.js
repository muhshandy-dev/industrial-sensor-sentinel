// Perhitungan evaluasi murni (tanpa DOM) dari skor yang tersimpan di data website.
// Dipakai untuk kurva presisi-recall, sapuan batas alarm, dan status pemutar rekaman.
// Diuji dengan node terhadap reports/results.json agar tidak ada angka yang dikarang.
import { evaluateExperiment } from "./logic.js";

// Grid batas alarm yang sama dengan pipeline Python: 56 titik geometris 0,05 sampai 100, dibulatkan 3 desimal.
export const THRESHOLDS = Array.from({ length: 56 }, (_, i) => Math.round(Math.exp(Math.log(0.05) + (i * (Math.log(100) - Math.log(0.05))) / 55) * 1000) / 1000);

// Label per baris (1 bila di dalam kejadian) dan skor, hanya baris yang dinilai.
function pooled(exps, model, mode) {
  const y = [];
  const sc = [];
  for (const e of exps) {
    const scores = e.model[model][mode].skor;
    const [s0, e0] = e.kejadian;
    for (let i = e.kalibrasi_baris; i < e.baris; i++) {
      y.push(i >= s0 && i <= e0 ? 1 : 0);
      sc.push(scores[i]);
    }
  }
  return { y, sc };
}

// Kurva presisi-recall dari skor mentah (tanpa aturan ketekunan dan penahanan),
// dengan definisi average precision yang sama seperti scikit-learn.
export function prCurve(exps, model, mode, maxPoints = 240) {
  const { y, sc } = pooled(exps, model, mode);
  const order = sc.map((_, i) => i).sort((a, b) => sc[b] - sc[a]);
  const P = y.reduce((t, v) => t + v, 0);
  const pts = [];
  let tp = 0, fp = 0, ap = 0, prevR = 0;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (y[i]) tp++; else fp++;
    const next = order[k + 1];
    if (next !== undefined && sc[next] === sc[i]) continue;
    const prec = tp / (tp + fp);
    const rec = tp / P;
    ap += (rec - prevR) * prec;
    prevR = rec;
    pts.push({ thr: sc[i], precision: prec, recall: rec });
  }
  // Perkecil jumlah titik untuk digambar, tanpa mengubah nilai titik yang tersisa.
  const step = Math.max(1, Math.floor(pts.length / maxPoints));
  const draw = pts.filter((_, k) => k % step === 0 || k === pts.length - 1);
  return { ap, prevalence: P / y.length, points: draw, all: pts };
}

// Titik kurva untuk batas skor tertentu (skor > batas), tanpa aturan alarm.
export function pointAt(curve, thr) {
  let best = null;
  for (const p of curve.all) if (p.thr > thr) best = p;
  return best ?? { thr, precision: 1, recall: 0 };
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Hasil gabungan pada semua rekaman untuk satu konfigurasi alarm.
export function aggregateAt(exps, model, mode, cfg) {
  let tp = 0, fp = 0, fn = 0, detected = 0, falseEp = 0, hours = 0;
  const delays = [];
  for (const e of exps) {
    const r = evaluateExperiment(e, e.model[model][mode].skor, cfg);
    tp += r.tp; fp += r.fp; fn += r.fn;
    if (r.detected) { detected++; delays.push(r.delay); }
    falseEp += r.falseEpisodes;
    hours += r.normalHours;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    eventRecall: detected / exps.length,
    falsePerHour: hours ? falseEp / hours : 0,
    medianDelay: median(delays),
  };
}

// Sapuan batas alarm dengan ketekunan dan penahanan tetap.
export function sweep(exps, model, mode, persistence, holdSeconds, thresholds = THRESHOLDS) {
  return thresholds.map((ambang) => ({ ambang, ...aggregateAt(exps, model, mode, { ambang, ketekunan_detik: persistence, tahan_detik: holdSeconds }) }));
}

// Status pemutar pada satu baris rekaman. Dipakai juga oleh tes sinkronisasi.
// flags: alarm per baris (sudah memperhitungkan kalibrasi), episodes: [awal, akhir] per alarm.
export function stateAt(exp, scores, cfg, res, i) {
  const [s0, e0] = exp.kejadian;
  if (i < exp.kalibrasi_baris) return "kalibrasi";
  const inEvent = i >= s0 && i <= e0;
  if (res.flags[i]) {
    const ep = res.episodes.find(([a, b]) => i >= a && i <= b);
    const correct = ep && ep[0] >= s0 && ep[0] <= e0;
    return correct ? "alarm-benar" : "alarm-palsu";
  }
  if (inEvent) return "kejadian";
  if (i > e0 && !res.detected) return "terlewat";
  if (scores[i] > cfg.ambang) return "naik";
  return "normal";
}
