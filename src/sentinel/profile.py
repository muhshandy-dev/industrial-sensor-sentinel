"""Profil data SKAB: struktur, label, celah waktu, rezim operasi, dan besar pergeseran sensor."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .data import ALL_FILES, EXPERIMENTS, NORMAL_ONLY, SENSORS, SKAB_COMMIT, load_experiment
from .splits import sessions_by_date, timestamp_overlaps

GAP_SECONDS = 5.0


def profile_experiment(exp: str, df: pd.DataFrame) -> dict:
    t = df["datetime"]
    step = t.diff().dt.total_seconds().dropna()
    y = df["anomaly"].to_numpy()
    out = {
        "baris": len(df),
        "mulai": str(t.iloc[0]),
        "selesai": str(t.iloc[-1]),
        "durasi_detik": float((t.iloc[-1] - t.iloc[0]).total_seconds()),
        "langkah_min_detik": float(step.min()),
        "langkah_maks_detik": float(step.max()),
        "celah_lebih_dari_5_detik": int((step > GAP_SECONDS).sum()),
        "cap_waktu_ganda": int(t.duplicated().sum()),
        "cap_waktu_menurun": int((step < 0).sum()),
        "nilai_kosong": int(df[SENSORS].isna().sum().sum()),
        "baris_anomali": int(y.sum()),
    }
    if y.any():
        a = int(y.argmax())
        b = a + int(y.sum())
        contiguous = bool(y[a:b].all())
        normal = df.iloc[:a][SENSORS]
        anom = df.iloc[a:b][SENSORS]
        sd = normal.std().replace(0, np.nan)
        shift = ((anom.mean() - normal.mean()) / sd).abs()
        out.update(
            {
                "anomali_satu_segmen": contiguous,
                "awal_anomali_detik": float((t.iloc[a] - t.iloc[0]).total_seconds()),
                "akhir_anomali_detik": float((t.iloc[b - 1] - t.iloc[0]).total_seconds()),
                "baris_normal_sebelum": a,
                "baris_normal_sesudah": len(df) - b,
                "persen_anomali": 100 * float(y.mean()),
                "pergeseran_terbesar_sensor": str(shift.idxmax()),
                "pergeseran_terbesar_sd": float(shift.max()),
                "pergeseran_sd": {s: float(shift[s]) for s in SENSORS},
            }
        )
    return out


def run_profile(data_dir: Path) -> dict:
    dfs = {e: load_experiment(data_dir, e) for e in ALL_FILES}
    per = {e: profile_experiment(e, d) for e, d in dfs.items()}
    starts = {e: dfs[e]["datetime"].iloc[0] for e in EXPERIMENTS}
    ends = {e: dfs[e]["datetime"].iloc[-1] for e in EXPERIMENTS}
    sessions = {}
    for session, exps in sessions_by_date(starts).items():
        normal = pd.concat(
            [dfs[e].iloc[: int(dfs[e]["anomaly"].to_numpy().argmax())] for e in exps]
        )
        sessions[session] = {
            "eksperimen": exps,
            "rerata_normal": {s: float(normal[s].mean()) for s in SENSORS},
        }
    total = sum(p["baris"] for e, p in per.items() if e != NORMAL_ONLY)
    anom = sum(p["baris_anomali"] for p in per.values())
    return {
        "sumber": {"repo": "waico/SKAB", "commit": SKAB_COMMIT, "lisensi": "GPL-3.0"},
        "jumlah_berkas": len(dfs),
        "eksperimen_berlabel": len(EXPERIMENTS),
        "total_baris_berlabel": total,
        "total_baris_anomali": anom,
        "persen_anomali": 100 * anom / total,
        "rekaman_normal_baris": per[NORMAL_ONLY]["baris"],
        "sesi": sessions,
        "cap_waktu_tumpang_tindih": [
            {"a": a, "b": b, "detik": s} for a, b, s in timestamp_overlaps(starts, ends)
        ],
        "rekaman_normal_tumpang_tindih_dengan": [
            e
            for e in EXPERIMENTS
            if starts[e] < dfs[NORMAL_ONLY]["datetime"].iloc[-1]
            and ends[e] > dfs[NORMAL_ONLY]["datetime"].iloc[0]
        ],
        "per_berkas": per,
    }


def write_profile(profile: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
