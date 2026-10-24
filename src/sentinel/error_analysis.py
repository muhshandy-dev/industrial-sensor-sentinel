"""Analisis kesalahan: kapan dan di mana alarm palsu muncul, dan eksperimen mana yang terlewat."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from .alarms import episodes
from .data import SCENARIOS, SENSORS
from .evaluate import ChosenRun, Loaded
from .experiment import flags_for


def analyse_run(run: ChosenRun, loaded: Loaded, profile_files: dict) -> dict:
    rows = []
    for exp in loaded.split.test:
        sc = run.scored.get(exp)
        if sc is None:
            continue
        mk = sc.eval_mask
        fl = flags_for(sc, run.threshold, run.persistence, run.hold)
        y = sc.y.astype(bool)
        ev = episodes(y)
        s, e = ev[0]
        pre = np.arange(len(y)) < s
        post = np.arange(len(y)) > e
        eps = [(a, b) for a, b in episodes(fl & mk)]
        false_eps = [(a, b) for a, b in eps if not (s <= a <= e)]
        inside = np.flatnonzero(fl[s : e + 1])
        info = profile_files[exp]
        rows.append(
            {
                "eksperimen": exp,
                "skenario": SCENARIOS[exp],
                "pergeseran_sensor_sd": info["pergeseran_terbesar_sd"],
                "sensor_paling_bergeser": info["pergeseran_terbesar_sensor"],
                "terdeteksi": bool(inside.size),
                "tunda_detik": (
                    float((sc.times.iloc[s + inside[0]] - sc.times.iloc[s]).total_seconds())
                    if inside.size
                    else None
                ),
                "titik_terlewat": int((y & ~fl & mk).sum()),
                "titik_anomali": int((y & mk).sum()),
                "alarm_palsu_titik_sebelum": int((fl & mk & pre).sum()),
                "alarm_palsu_titik_sesudah": int((fl & mk & post).sum()),
                "episode_palsu": len(false_eps),
                "episode_palsu_sesudah_kejadian": sum(1 for a, _ in false_eps if a > e),
                "durasi_episode_palsu_median_detik": (
                    float(np.median([b - a + 1 for a, b in false_eps])) if false_eps else 0.0
                ),
            }
        )
    df = pd.DataFrame(rows)
    rho = spearmanr(df["pergeseran_sensor_sd"], df["titik_terlewat"] / df["titik_anomali"])
    return {
        "per_eksperimen": rows,
        "alarm_palsu_titik_sebelum": int(df["alarm_palsu_titik_sebelum"].sum()),
        "alarm_palsu_titik_sesudah": int(df["alarm_palsu_titik_sesudah"].sum()),
        "korelasi_pergeseran_dan_proporsi_terlewat_spearman": (
            None if np.isnan(rho.statistic) else float(rho.statistic)
        ),
        "catatan": "Pergeseran = selisih rerata anomali dan normal dalam simpangan baku normal.",
        "sensor": SENSORS,
    }


def analyse_all(runs: dict, loaded: Loaded, profile: dict) -> dict:
    files = profile["per_berkas"]
    return {
        f"{p}|{m}|{mode}": analyse_run(run, loaded, files) for (p, m, mode), run in runs.items()
    }
