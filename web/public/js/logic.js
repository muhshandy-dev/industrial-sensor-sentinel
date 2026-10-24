// Logika murni (tanpa DOM). Port dari src/sentinel/alarms.py dan metrics.py.
// Dipakai di browser dan diuji dengan node terhadap hasil Python.

export const MAX_STEP_SECONDS = 5;

export function persist(flags, p) {
  if (p <= 1) return flags.slice();
  const out = new Array(flags.length).fill(false);
  let lastFalse = -1;
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) lastFalse = i;
    out[i] = flags[i] && i - lastFalse >= p;
  }
  return out;
}

export function hold(flags, h) {
  if (h <= 0) return flags.slice();
  const c = new Array(flags.length + 1).fill(0);
  for (let i = 0; i < flags.length; i++) c[i + 1] = c[i] + (flags[i] ? 1 : 0);
  const out = new Array(flags.length);
  for (let i = 0; i < flags.length; i++) {
    out[i] = c[i + 1] - c[Math.max(i + 1 - h - 1, 0)] > 0;
  }
  return out;
}

export function toAlarm(scores, threshold, p, h) {
  return hold(persist(scores.map((s) => s > threshold), p), h);
}

export function episodes(flags) {
  const out = [];
  let start = -1;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && start < 0) start = i;
    else if (!flags[i] && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, flags.length - 1]);
  return out;
}

// Alarm untuk satu eksperimen pada konfigurasi tertentu, hanya pada baris yang dievaluasi.
export function alarmFor(exp, scores, cfg) {
  const all = toAlarm(scores, cfg.ambang, cfg.ketekunan_detik, cfg.tahan_detik);
  return all.map((f, i) => f && i >= exp.kalibrasi_baris);
}

export function observedHours(detik, mask) {
  let total = 0;
  for (let i = 1; i < detik.length; i++) {
    if (mask[i]) total += Math.min(detik[i] - detik[i - 1], MAX_STEP_SECONDS);
  }
  return total / 3600;
}

// Hasil satu eksperimen. Hanya baris dari kalibrasi_baris ke atas yang dievaluasi.
export function evaluateExperiment(exp, scores, cfg) {
  const from = exp.kalibrasi_baris;
  const flags = alarmFor(exp, scores, cfg).slice(from);
  const detik = exp.detik.slice(from);
  const [s0, e0] = exp.kejadian;
  const y = detik.map((_, i) => i + from >= s0 && i + from <= e0);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < y.length; i++) {
    if (y[i] && flags[i]) tp++;
    else if (!y[i] && flags[i]) fp++;
    else if (y[i]) fn++;
    else tn++;
  }
  const s = s0 - from;
  const e = e0 - from;
  let detected = false;
  let delay = null;
  for (let i = Math.max(s, 0); i <= e; i++) {
    if (flags[i]) {
      detected = true;
      delay = detik[i] - detik[s];
      break;
    }
  }
  const eps = episodes(flags);
  let falseEpisodes = 0;
  for (const [a] of eps) if (!(a >= s && a <= e)) falseEpisodes++;
  const normalMask = y.map((v) => !v);
  return {
    tp, fp, fn, tn,
    detected,
    delay,
    falseEpisodes,
    normalHours: observedHours(detik, normalMask),
    episodes: eps.map(([a, b]) => [a + from, b + from]),
    flags: alarmFor(exp, scores, cfg),
  };
}

export function f1(r) {
  const p = r.tp + r.fp ? r.tp / (r.tp + r.fp) : 0;
  const rc = r.tp + r.fn ? r.tp / (r.tp + r.fn) : 0;
  return p + rc ? (2 * p * rc) / (p + rc) : 0;
}
