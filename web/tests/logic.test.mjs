import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { persist, hold, toAlarm, episodes, evaluateExperiment } from "../public/js/logic.js";

const dataDir = new URL("../public/data/", import.meta.url);
const results = JSON.parse(readFileSync(new URL("../../reports/results.json", import.meta.url)));

test("persist: butuh p sampel berturut-turut dan tidak melihat ke depan", () => {
  assert.deepEqual(persist([1, 1, 0, 1, 1, 1, 1].map(Boolean), 3), [false, false, false, false, false, true, true]);
  assert.deepEqual(persist([0, 0, 1, 1, 1, 0, 0].map(Boolean), 2), [false, false, false, true, true, false, false]);
});

test("hold: alarm bertahan h sampel", () => {
  assert.deepEqual(hold([1, 0, 1, 0, 0, 0, 0].map(Boolean), 1), [true, true, true, true, false, false, false]);
  assert.deepEqual(hold([0, 0, 1].map(Boolean), 5), [false, false, true]);
});

test("episodes dan toAlarm cocok dengan implementasi Python", () => {
  assert.deepEqual(episodes([0, 1, 1, 0, 1, 0, 1, 1].map(Boolean)), [[1, 2], [4, 4], [6, 7]]);
  assert.deepEqual(toAlarm([0, 2, 2, 0, 0, 2, 2, 2, 0], 1, 2, 1), [false, false, true, true, false, false, true, true, true]);
});

test("hasil per rekaman di browser sama dengan hasil Python untuk semua model dan mode", () => {
  const files = readdirSync(dataDir).filter((f) => f.startsWith("eksperimen-"));
  assert.equal(files.length, 10);
  let checked = 0;
  for (const f of files) {
    const exp = JSON.parse(readFileSync(new URL(f, dataDir)));
    for (const [model, modes] of Object.entries(exp.model)) {
      for (const [mode, m] of Object.entries(modes)) {
        const cfg = { ambang: m.ambang, ketekunan_detik: m.ketekunan_detik, tahan_detik: m.tahan_detik };
        const r = evaluateExperiment(exp, m.skor, cfg);
        const py = results.protokol.p1_kalibrasi_awal[model][mode].uji_per_eksperimen.find((e) => e.exp === exp.id);
        const where = `${exp.id} ${model} ${mode}`;
        assert.ok(py, `hasil Python tidak ada untuk ${where}`);
        assert.deepEqual([r.tp, r.fp, r.fn, r.tn], [py.tp, py.fp, py.fn, py.tn], where);
        assert.equal(r.detected, py.event_detected, where);
        assert.equal(r.delay, py.delay_seconds, where);
        assert.equal(r.falseEpisodes, py.false_episodes, where);
        assert.ok(Math.abs(r.normalHours - py.normal_hours) < 1e-9, where);
        assert.deepEqual(r.episodes, m.episode_alarm, where);
        checked++;
      }
    }
  }
  assert.equal(checked, 60);
});
