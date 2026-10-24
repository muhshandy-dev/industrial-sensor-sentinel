"""Pemeriksaan independen atas angka yang dipublikasikan di website.

Skrip ini sengaja TIDAK memakai modul metrik, alarm, atau pembagian dari paket sentinel.
Ia membaca CSV SKAB mentah, data website (web/public/data), dan reports/results.json,
lalu memeriksa bahwa:
  1. Sensor dan label di website identik dengan CSV SKAB asli.
  2. Pembagian data: uji adalah rekaman paling baru per sesi, tidak tumpang tindih
     dengan latih/validasi, dan 300 detik kalibrasi tidak memuat label anomali.
  3. Metrik per rekaman dan gabungan (F1, recall kejadian, tunda, alarm palsu per jam)
     yang dihitung ulang dari skor tersimpan sama dengan reports/results.json.
  4. Ringkasan website (ringkasan.json) memuat angka kinerja yang sama persis.
Keluar dengan kode 1 bila ada yang tidak cocok.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import f1_score

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "skab"
WEB = ROOT / "web" / "public" / "data"
RESULTS = json.loads((ROOT / "reports" / "results.json").read_text())
SUMMARY = json.loads((WEB / "ringkasan.json").read_text())
SENSORS = [
    "Accelerometer1RMS", "Accelerometer2RMS", "Current", "Pressure",
    "Temperature", "Thermocouple", "Voltage", "Volume Flow RateRMS",
]  # fmt: skip
problems: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        problems.append(msg)


def raw(exp: str) -> pd.DataFrame:
    return pd.read_csv(RAW / f"{exp}.csv", sep=";", parse_dates=["datetime"])


def alarm(score: list[float], thr: float, p: int, h: int) -> np.ndarray:
    """Implementasi ulang yang lugas dengan perulangan biasa."""
    out = np.zeros(len(score), dtype=bool)
    run = 0
    last_on = -(10**9)
    for i, s in enumerate(score):
        run = run + 1 if s > thr else 0
        if run >= p:
            last_on = i
        out[i] = i - last_on <= h
    return out


def runs(flags: np.ndarray) -> list[tuple[int, int]]:
    res, start = [], None
    for i, f in enumerate(list(flags) + [False]):
        if f and start is None:
            start = i
        if not f and start is not None:
            res.append((start, i - 1))
            start = None
    return res


# 1. Data website sama dengan CSV asli
for entry in SUMMARY["eksperimen"]:
    exp = json.loads((WEB / entry["berkas"]).read_text())
    df = raw(exp["id"])
    check(len(df) == exp["baris"], f"{exp['id']}: jumlah baris berbeda")
    for s in SENSORS:
        check(
            np.allclose(np.round(df[s].to_numpy(), 4), exp["sensor"][s], atol=1e-9),
            f"{exp['id']}: sensor {s} tidak sama dengan CSV",
        )
    y = df["anomaly"].to_numpy().astype(int)
    idx = np.flatnonzero(y)
    check([int(idx[0]), int(idx[-1])] == exp["kejadian"], f"{exp['id']}: kejadian tidak sama")
    sec = (df["datetime"] - df["datetime"].iloc[0]).dt.total_seconds().astype(int).tolist()
    check(sec == exp["detik"], f"{exp['id']}: cap waktu tidak sama")

# 2. Pembagian data
sp = RESULTS["pembagian"]
labelled = [f"valve1/{i}" for i in range(16)] + [f"valve2/{i}" for i in range(4)]
labelled += [f"other/{i}" for i in range(1, 15)]
starts = {e: raw(e)["datetime"].iloc[0] for e in labelled}
by_day: dict[str, list[str]] = {}
for e in sorted(labelled, key=lambda e: starts[e]):
    by_day.setdefault(starts[e].strftime("%Y-%m-%d"), []).append(e)
for day, exps in by_day.items():
    test = [e for e in exps if e in sp["test"]]
    dev = [e for e in exps if e in sp["train"] + sp["val"]]
    check(bool(test), f"sesi {day} tanpa uji")
    check(
        min(starts[e] for e in test) > max(starts[e] for e in dev),
        f"sesi {day}: uji tidak paling baru",
    )
    check(exps[-len(test) :] == test, f"sesi {day}: uji bukan rekaman terakhir")
all_sets = sp["train"] + sp["val"] + sp["purge"] + sp["test"]
check(len(all_sets) == len(set(all_sets)) == 34, "rekaman ganda atau hilang dalam pembagian")
warm = RESULTS["kalibrasi_awal_detik"]
for e in sp["test"]:
    check(raw(e)["anomaly"].iloc[:warm].sum() == 0, f"{e}: kalibrasi memuat label anomali")
for name in ("sensitif", "hemat_alarm"):
    for m, r in RESULTS["protokol"]["p1_kalibrasi_awal"].items():
        tuned = set(r[name]["penyetelan"]["eksperimen"])
        check(tuned.isdisjoint(sp["test"]), f"{m} {name}: penyetelan memakai rekaman uji")

# 3. Metrik dihitung ulang dari skor yang dipublikasikan
pooled: dict[tuple[str, str], tuple[list[int], list[int]]] = {}
for entry in SUMMARY["eksperimen"]:
    exp = json.loads((WEB / entry["berkas"]).read_text())
    s0, e0 = exp["kejadian"]
    w = exp["kalibrasi_baris"]
    t = np.array(exp["detik"], dtype=float)
    y = np.zeros(exp["baris"], dtype=bool)
    y[s0 : e0 + 1] = True
    for model, modes in exp["model"].items():
        for mode, m in modes.items():
            fl = alarm(m["skor"], m["ambang"], m["ketekunan_detik"], m["tahan_detik"])
            fl[:w] = False
            ref = next(
                r
                for r in RESULTS["protokol"]["p1_kalibrasi_awal"][model][mode]["uji_per_eksperimen"]
                if r["exp"] == exp["id"]
            )
            yy, ff, tt = y[w:], fl[w:], t[w:]
            tp, fp = int((yy & ff).sum()), int((~yy & ff).sum())
            fn, tn = int((yy & ~ff).sum()), int((~yy & ~ff).sum())
            check(
                [tp, fp, fn, tn] == [ref["tp"], ref["fp"], ref["fn"], ref["tn"]],
                f"{exp['id']} {model} {mode}: matriks",
            )
            hits = np.flatnonzero(ff[s0 - w : e0 - w + 1])
            det = bool(hits.size)
            delay = float(tt[s0 - w + hits[0]] - tt[s0 - w]) if det else None
            check(
                det == ref["event_detected"] and delay == ref["delay_seconds"],
                f"{exp['id']} {model} {mode}: deteksi/tunda",
            )
            false_eps = sum(1 for a, _ in runs(ff) if not (s0 - w <= a <= e0 - w))
            check(false_eps == ref["false_episodes"], f"{exp['id']} {model} {mode}: alarm palsu")
            step = np.minimum(np.diff(tt, prepend=tt[0]), 5.0)
            check(
                abs(step[~yy].sum() / 3600 - ref["normal_hours"]) < 1e-9,
                f"{exp['id']} {model} {mode}: jam normal",
            )
            key = (model, mode)
            pooled.setdefault(key, ([], []))
            pooled[key][0].extend(yy.astype(int).tolist())
            pooled[key][1].extend(ff.astype(int).tolist())

for (model, mode), (yt, yp) in pooled.items():
    ref = RESULTS["protokol"]["p1_kalibrasi_awal"][model][mode]["uji"]
    check(
        abs(f1_score(yt, yp) - ref["f1"]) < 1e-9,
        f"{model} {mode}: F1 gabungan {f1_score(yt, yp)} vs {ref['f1']}",
    )
    per = RESULTS["protokol"]["p1_kalibrasi_awal"][model][mode]["uji_per_eksperimen"]
    rec = sum(r["event_detected"] for r in per) / len(per)
    check(abs(rec - ref["recall_kejadian"]) < 1e-12, f"{model} {mode}: recall kejadian")
    fa = sum(r["false_episodes"] for r in per) / sum(r["normal_hours"] for r in per)
    check(abs(fa - ref["alarm_palsu_per_jam"]) < 1e-9, f"{model} {mode}: alarm palsu per jam")
    delays = [r["delay_seconds"] for r in per if r["delay_seconds"] is not None]
    check(
        float(np.median(delays)) == ref["tunda_deteksi_median_detik"],
        f"{model} {mode}: tunda median",
    )

# 4. Website memuat angka yang sama
check(SUMMARY["kinerja"] == RESULTS["protokol"], "ringkasan.json kinerja berbeda dari results.json")
check(SUMMARY["pembagian"] == RESULTS["pembagian"], "ringkasan.json pembagian berbeda")
check(
    SUMMARY["perbandingan_berpasangan"] == RESULTS["perbandingan_berpasangan"],
    "perbandingan berbeda",
)

if problems:
    print("\n".join(problems))
    sys.exit(1)
n = sum(
    len(m)
    for e in SUMMARY["eksperimen"]
    for m in json.loads((WEB / e["berkas"]).read_text())["model"].values()
)
print(f"OK: {len(SUMMARY['eksperimen'])} rekaman uji, {n} konfigurasi model, semua angka cocok")
