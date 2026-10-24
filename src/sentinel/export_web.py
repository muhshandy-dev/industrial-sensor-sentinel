"""Ekspor hasil batch ke JSON statis untuk website. Hanya eksperimen uji (tidak dipakai untuk
latih atau setel) yang ditampilkan dengan prediksi model."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .alarms import episodes, to_alarm
from .data import SCENARIOS, SENSORS, SKAB_COMMIT
from .evaluate import PROTOCOLS, ChosenRun, Loaded
from .experiment import WARMUP
from .models import MODELS

PRIMARY = PROTOCOLS[0]
MODES = ("sensitif", "hemat_alarm")
SENSOR_LABELS = {
    "Accelerometer1RMS": "Getaran 1",
    "Accelerometer2RMS": "Getaran 2",
    "Current": "Arus motor",
    "Pressure": "Tekanan",
    "Temperature": "Suhu motor",
    "Thermocouple": "Suhu cairan",
    "Voltage": "Tegangan motor",
    "Volume Flow RateRMS": "Laju aliran",
}
SENSOR_UNITS = {
    "Accelerometer1RMS": "g",
    "Accelerometer2RMS": "g",
    "Current": "A",
    "Pressure": "bar",
    "Temperature": "°C",
    "Thermocouple": "°C",
    "Voltage": "V",
    "Volume Flow RateRMS": "L/menit",
}
MODEL_LABELS = {
    "ambang_statistik": "Ambang statistik",
    "pca": "PCA (T2 dan Q)",
    "isolation_forest": "Isolation Forest",
}


def _round(a: np.ndarray, nd: int) -> list:
    return np.round(a.astype(float), nd).tolist()


def export_experiment(
    exp: str, loaded: Loaded, runs: dict[tuple[str, str, str], ChosenRun]
) -> dict:
    df = loaded.dfs[exp]
    t0 = df["datetime"].iloc[0]
    y = df["anomaly"].to_numpy()
    s, e = episodes(y.astype(bool))[0]
    models: dict = {}
    for model in MODELS:
        by_mode = {}
        for mode in MODES:
            run = runs.get((PRIMARY, model, mode))
            if run is None or exp not in run.scored:
                continue
            sc = run.scored[exp]
            alarm = to_alarm(sc.score, run.threshold, run.persistence, run.hold) & sc.eval_mask
            by_mode[mode] = {
                "jendela_fitur": run.window,
                "ambang": run.threshold,
                "ketekunan_detik": run.persistence,
                "tahan_detik": run.hold,
                "skor": _round(np.clip(sc.score, -5, 1000), 5),
                "episode_alarm": [list(map(int, ep)) for ep in episodes(alarm)],
            }
        models[model] = by_mode
    return {
        "id": exp,
        "skenario": SCENARIOS[exp],
        "sesi": loaded.split.session_of[exp],
        "mulai": str(t0),
        "baris": len(df),
        "kalibrasi_baris": WARMUP,
        "kejadian": [int(s), int(e)],
        "detik": [int(x) for x in (df["datetime"] - t0).dt.total_seconds()],
        "sensor": {k: _round(df[k].to_numpy(), 4) for k in SENSORS},
        "model": models,
    }


def export_web(
    out_dir: Path,
    results: dict,
    error_analysis: dict,
    profile: dict,
    runs: dict[tuple[str, str, str], ChosenRun],
    loaded: Loaded,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    shown = [
        e
        for e in loaded.split.test
        if all(e in runs[(PRIMARY, m, "sensitif")].scored for m in MODELS)
    ]
    index = []
    for exp in shown:
        data = export_experiment(exp, loaded, runs)
        name = f"eksperimen-{exp.replace('/', '-')}.json"
        (out_dir / name).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        index.append(
            {
                "id": exp,
                "berkas": name,
                "skenario": data["skenario"],
                "baris": data["baris"],
                "kejadian": data["kejadian"],
            }
        )
    keys = (
        "jumlah_berkas",
        "eksperimen_berlabel",
        "total_baris_berlabel",
        "total_baris_anomali",
        "persen_anomali",
        "rekaman_normal_baris",
    )
    meta = {
        "produk": "Industrial Sensor Sentinel",
        "fokus": "Deteksi Anomali dan Peringatan Dini Sensor Industri",
        "sumber_data": {
            "nama": "Skoltech Anomaly Benchmark (SKAB)",
            "repo": "https://github.com/waico/SKAB",
            "commit": SKAB_COMMIT,
            "lisensi": "GPL-3.0",
        },
        "sensor": [
            {"id": k, "label": SENSOR_LABELS[k], "satuan": SENSOR_UNITS[k]} for k in SENSORS
        ],
        "model": [{"id": k, "label": MODEL_LABELS[k]} for k in MODELS],
        "protokol_utama": PRIMARY,
        "eksperimen": index,
        "pembagian": results["pembagian"],
        "kalibrasi_awal_detik": results["kalibrasi_awal_detik"],
        "grid": results["grid"],
        "profil": {k: profile[k] for k in keys}
        | {"sesi": {k: len(v["eksperimen"]) for k, v in profile["sesi"].items()}},
        "kinerja": results["protokol"],
        "perbandingan_berpasangan": results["perbandingan_berpasangan"],
        "analisis_kesalahan": error_analysis,
    }
    (out_dir / "ringkasan.json").write_text(
        json.dumps(meta, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    )
