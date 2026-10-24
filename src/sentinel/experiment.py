"""Dua protokol evaluasi, keduanya tanpa random split per baris.

P1 kalibrasi awal: tiap eksperimen dikalibrasi dari WARMUP detik pertamanya (normal), lalu
dipantau sisanya. Tidak butuh eksperimen lain untuk fit.
P2 riwayat normal: satu model per sesi, dilatih dari bagian normal (sebelum anomali pertama)
eksperimen latih sesi itu, lalu dipakai memantau eksperimen validasi dan uji.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .alarms import to_alarm
from .features import build_features
from .metrics import FileResult, aggregate, evaluate_file, pr_auc
from .models import ScoreNormalizer, make_model

WARMUP = 300
FIT_FRACTION_P1 = 2 / 3
FIT_FRACTION_P2 = 0.8
WINDOWS = (1, 10, 30)
THRESHOLDS = np.round(np.geomspace(0.05, 100, 56), 3)
PERSISTENCE = (1, 5, 15)
HOLD = (0, 10, 30)
MAX_FALSE_PER_HOUR = 2.0


@dataclass
class Scored:
    exp: str
    times: pd.Series
    y: np.ndarray
    score: np.ndarray  # sudah dinormalkan
    eval_mask: np.ndarray


def first_anomaly(df: pd.DataFrame) -> int:
    """Indeks baris anomali pertama; panjang data bila tidak ada anomali."""
    y = df["anomaly"].to_numpy()
    return int(y.argmax()) if y.any() else len(y)


def p1_eligible(df: pd.DataFrame) -> bool:
    return first_anomaly(df) >= WARMUP


def score_p1(exp: str, df: pd.DataFrame, model: str, window: int, seed: int = 0) -> Scored:
    feats = build_features(df, window)
    n_fit = int(WARMUP * FIT_FRACTION_P1)
    m = make_model(model, seed).fit(feats[:n_fit])
    norm = ScoreNormalizer().fit(m.score(feats[n_fit:WARMUP]))
    s = norm.transform(m.score(feats))
    mask = np.arange(len(df)) >= WARMUP
    return Scored(exp, df["datetime"], df["anomaly"].to_numpy(), s, mask)


def score_p2_session(
    dfs: dict[str, pd.DataFrame],
    train: list[str],
    targets: list[str],
    model: str,
    window: int,
    extra_normal: list[pd.DataFrame] | None = None,
    seed: int = 0,
) -> dict[str, Scored]:
    """Latih satu model dari bagian normal eksperimen latih (urut waktu), lalu beri skor."""
    parts = [*(extra_normal or [])]
    parts += [dfs[e].iloc[: first_anomaly(dfs[e])] for e in train]
    feats = np.vstack([build_features(p, window) for p in parts if len(p)])
    n_fit = int(len(feats) * FIT_FRACTION_P2)
    m = make_model(model, seed).fit(feats[:n_fit])
    norm = ScoreNormalizer().fit(m.score(feats[n_fit:]))
    out = {}
    for e in targets:
        df = dfs[e]
        s = norm.transform(m.score(build_features(df, window)))
        out[e] = Scored(e, df["datetime"], df["anomaly"].to_numpy(), s, np.ones(len(df), bool))
    return out


def flags_for(sc: Scored, threshold: float, p: int, h: int) -> np.ndarray:
    return to_alarm(sc.score, threshold, p, h) & sc.eval_mask


def evaluate_set(scored: list[Scored], threshold: float, p: int, h: int) -> list[FileResult]:
    out = []
    for sc in scored:
        mk = sc.eval_mask
        fl = flags_for(sc, threshold, p, h)[mk]
        out.append(evaluate_file(sc.exp, sc.times[mk].reset_index(drop=True), sc.y[mk], fl))
    return out


def pooled_pr_auc(scored: list[Scored]) -> float:
    y = np.concatenate([s.y[s.eval_mask] for s in scored])
    sc = np.concatenate([s.score[s.eval_mask] for s in scored])
    return pr_auc(y, sc)


def prevalence(scored: list[Scored]) -> float:
    y = np.concatenate([s.y[s.eval_mask] for s in scored])
    return float(y.mean())


def grid(scored: list[Scored]) -> list[dict]:
    """Nilai metrik gabungan untuk setiap kombinasi (ambang, ketekunan, tahan)."""
    rows = []
    for p in PERSISTENCE:
        for h in HOLD:
            for thr in THRESHOLDS:
                agg = aggregate(evaluate_set(scored, float(thr), p, h))
                rows.append({"threshold": float(thr), "persistence": p, "hold": h, **agg})
    return rows


def pick(rows: list[dict], max_false_per_hour: float | None = None) -> dict | None:
    """F1 gabungan tertinggi (opsional dengan batas alarm palsu per jam).
    Seri: FAR lebih rendah, lalu ambang lebih tinggi."""
    ok = [
        r
        for r in rows
        if max_false_per_hour is None or r["alarm_palsu_per_jam"] <= max_false_per_hour
    ]
    if not ok:
        return None
    return max(ok, key=lambda r: (round(r["f1"], 6), -r["far_persen"], r["threshold"]))


def bootstrap_ci(
    results: list[FileResult], n_boot: int = 1000, seed: int = 0
) -> dict[str, list[float]]:
    """Selang 95 persen (persentil) dengan sampel ulang eksperimen, bukan baris."""
    rng = np.random.default_rng(seed)
    keys = ("f1", "recall_kejadian", "alarm_palsu_per_jam")
    draws = {k: [] for k in keys}
    n = len(results)
    for _ in range(n_boot):
        pick = rng.integers(0, n, n)
        agg = aggregate([results[i] for i in pick])
        for k in keys:
            draws[k].append(agg[k])
    return {
        k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in draws.items()
    }


def paired_bootstrap_diff(
    a: list[FileResult], b: list[FileResult], n_boot: int = 1000, seed: int = 0
) -> dict:
    """Selisih F1 gabungan (a dikurangi b) dengan sampel ulang eksperimen yang sama untuk
    keduanya. Selang yang memuat 0 berarti beda belum terbukti."""
    assert [r.exp for r in a] == [r.exp for r in b]
    rng = np.random.default_rng(seed)
    n = len(a)
    diffs = []
    for _ in range(n_boot):
        pick = rng.integers(0, n, n)
        diffs.append(aggregate([a[i] for i in pick])["f1"] - aggregate([b[i] for i in pick])["f1"])
    point = aggregate(a)["f1"] - aggregate(b)["f1"]
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return {"selisih_f1": float(point), "selang_95": [float(lo), float(hi)]}
