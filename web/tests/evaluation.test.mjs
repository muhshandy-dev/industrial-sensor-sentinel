// Visualisasi evaluasi di website harus berasal dari skor yang sama dengan hasil Python.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prCurve, aggregateAt, sweep, stateAt, THRESHOLDS, pointAt } from "../public/js/evaluation.js";
import { evaluateExperiment } from "../public/js/logic.js";

const dataDir = new URL("../public/data/", import.meta.url);
const summary = JSON.parse(readFileSync(new URL("ringkasan.json", dataDir)));
const results = JSON.parse(readFileSync(new URL("../../reports/results.json", import.meta.url)));
const exps = summary.eksperimen.map((e) => JSON.parse(readFileSync(new URL(e.berkas, dataDir))));
const MODELS = ["ambang_statistik", "pca", "isolation_forest"];
const MODES = ["sensitif", "hemat_alarm"];
const P1 = results.protokol.p1_kalibrasi_awal;

test("kurva presisi-recall: luas di bawah kurva sama dengan PR-AUC hasil evaluasi", () => {
  for (const m of MODELS) {
    for (const mode of MODES) {
      const c = prCurve(exps, m, mode);
      assert.ok(Math.abs(c.ap - P1[m][mode].uji.pr_auc) < 1e-4, `${m} ${mode}: ${c.ap} vs ${P1[m][mode].uji.pr_auc}`);
      assert.ok(Math.abs(c.prevalence - P1[m][mode].uji.prevalensi_anomali) < 1e-9);
      for (const p of c.points) assert.ok(p.precision >= 0 && p.precision <= 1 && p.recall >= 0 && p.recall <= 1);
      const top = pointAt(c, 1e12);
      assert.equal(top.recall, 0);
    }
  }
});

test("hasil gabungan pada batas terpilih sama dengan hasil uji Python", () => {
  for (const m of MODELS) {
    for (const mode of MODES) {
      const ref = P1[m][mode];
      const r = aggregateAt(exps, m, mode, { ambang: ref.ambang, ketekunan_detik: ref.ketekunan_detik, tahan_detik: ref.tahan_detik });
      assert.ok(Math.abs(r.f1 - ref.uji.f1) < 1e-9, `${m} ${mode} f1`);
      assert.ok(Math.abs(r.precision - ref.uji.precision) < 1e-9, `${m} ${mode} presisi`);
      assert.ok(Math.abs(r.eventRecall - ref.uji.recall_kejadian) < 1e-9, `${m} ${mode} recall kejadian`);
      assert.ok(Math.abs(r.falsePerHour - ref.uji.alarm_palsu_per_jam) < 1e-9, `${m} ${mode} alarm palsu`);
      assert.equal(r.medianDelay, ref.uji.tunda_deteksi_median_detik, `${m} ${mode} tunda`);
    }
  }
});

test("sapuan batas memakai grid yang sama dan memuat batas terpilih", () => {
  assert.equal(THRESHOLDS.length, 56);
  for (const m of MODELS) {
    for (const mode of MODES) {
      const ref = P1[m][mode];
      assert.ok(THRESHOLDS.some((t) => Math.abs(t - ref.ambang) < 1e-9), `${m} ${mode}: batas tidak ada di grid`);
    }
  }
  const s = sweep(exps, "pca", "sensitif", P1.pca.sensitif.ketekunan_detik, P1.pca.sensitif.tahan_detik);
  const at = s.find((r) => Math.abs(r.ambang - P1.pca.sensitif.ambang) < 1e-9);
  assert.ok(Math.abs(at.f1 - P1.pca.sensitif.uji.f1) < 1e-9);
});

test("status pemutar sinkron dengan episode alarm yang diekspor dan label kejadian", () => {
  let checked = 0;
  for (const exp of exps) {
    const [s0, e0] = exp.kejadian;
    for (const m of MODELS) {
      for (const mode of MODES) {
        const d = exp.model[m][mode];
        const cfg = { ambang: d.ambang, ketekunan_detik: d.ketekunan_detik, tahan_detik: d.tahan_detik };
        const res = evaluateExperiment(exp, d.skor, cfg);
        const inAlarm = (i) => d.episode_alarm.some(([a, b]) => i >= a && i <= b);
        for (let i = 0; i < exp.baris; i++) {
          const st = stateAt(exp, d.skor, cfg, res, i);
          if (i < exp.kalibrasi_baris) { assert.equal(st, "kalibrasi"); continue; }
          assert.equal(st.startsWith("alarm"), inAlarm(i), `${exp.id} ${m} ${mode} baris ${i}: ${st}`);
          if (st === "alarm-benar") {
            const ep = d.episode_alarm.find(([a, b]) => i >= a && i <= b);
            assert.ok(ep[0] >= s0 && ep[0] <= e0);
          }
          if (st === "kejadian") assert.ok(i >= s0 && i <= e0);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 40000);
});

test("garis waktu kesalahan: kejadian tertangkap bila alarm menyala kapan pun selama kejadian", () => {
  for (const exp of exps) {
    const [s0, e0] = exp.kejadian;
    for (const m of MODELS) {
      for (const mode of MODES) {
        const ref = P1[m][mode].uji_per_eksperimen.find((r) => r.exp === exp.id);
        const hit = exp.model[m][mode].episode_alarm.some(([a, b]) => b >= s0 && a <= e0);
        assert.equal(hit, ref.event_detected, `${exp.id} ${m} ${mode}`);
      }
    }
  }
});
