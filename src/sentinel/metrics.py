"""Metrik tingkat titik dan tingkat kejadian. Satuan waktu: detik dan jam sesuai cap waktu data."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from .alarms import episodes

# Selisih waktu antar baris lebih dari ini dianggap celah data dan tidak dihitung sebagai
# waktu teramati.
MAX_STEP_SECONDS = 5.0


@dataclass
class FileResult:
    """Hasil satu eksperimen pada baris yang dievaluasi."""

    exp: str
    tp: int
    fp: int
    fn: int
    tn: int
    event_detected: bool
    delay_seconds: float | None
    false_episodes: int
    normal_hours: float
    event_seconds: float

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def observed_hours(times: pd.Series, mask: np.ndarray) -> float:
    """Jam teramati pada baris yang bertanda mask; celah besar tidak dihitung."""
    step = times.diff().dt.total_seconds().fillna(0.0).to_numpy()
    step = np.minimum(step, MAX_STEP_SECONDS)
    return float(step[mask].sum() / 3600.0)


def evaluate_file(exp: str, times: pd.Series, y: np.ndarray, flags: np.ndarray) -> FileResult:
    y = np.asarray(y).astype(bool)
    flags = np.asarray(flags).astype(bool)
    tp = int((y & flags).sum())
    fp = int((~y & flags).sum())
    fn = int((y & ~flags).sum())
    tn = int((~y & ~flags).sum())
    ev = episodes(y)
    detected, delay, event_seconds = False, None, 0.0
    if ev:
        s, e = ev[0]
        event_seconds = float((times.iloc[e] - times.iloc[s]).total_seconds())
        inside = np.flatnonzero(flags[s : e + 1])
        if inside.size:
            detected = True
            delay = float((times.iloc[s + inside[0]] - times.iloc[s]).total_seconds())
    false_eps = 0
    for a, _b in episodes(flags):
        # Alarm sah hanya bila mulai menyala pada baris yang dilabeli anomali.
        # Alarm yang sudah menyala sebelum kejadian dihitung palsu walau berlanjut ke dalamnya.
        starts_inside = any(s <= a <= e for s, e in ev)
        false_eps += 0 if starts_inside else 1
    return FileResult(
        exp=exp, tp=tp, fp=fp, fn=fn, tn=tn,
        event_detected=detected, delay_seconds=delay, false_episodes=false_eps,
        normal_hours=observed_hours(times, ~y), event_seconds=event_seconds,
    )  # fmt: skip


def _safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


def aggregate(results: list[FileResult]) -> dict:
    """Gabungkan hasil per eksperimen. Metrik titik digabung (pooled) dari semua baris."""
    tp = sum(r.tp for r in results)
    fp = sum(r.fp for r in results)
    fn = sum(r.fn for r in results)
    tn = sum(r.tn for r in results)
    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    f1 = _safe_div(2 * precision * recall, precision + recall)
    with_event = [r for r in results if r.event_seconds > 0]
    delays = [r.delay_seconds for r in with_event if r.delay_seconds is not None]
    hours = sum(r.normal_hours for r in results)
    return {
        "n_eksperimen": len(results),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "far_persen": 100 * _safe_div(fp, fp + tn),
        "mar_persen": 100 * _safe_div(fn, fn + tp),
        "recall_kejadian": _safe_div(sum(r.event_detected for r in with_event), len(with_event)),
        "tunda_deteksi_median_detik": float(np.median(delays)) if delays else None,
        "alarm_palsu_per_jam": _safe_div(sum(r.false_episodes for r in results), hours),
        "jam_normal_teramati": hours,
    }


def pr_auc(y: np.ndarray, scores: np.ndarray) -> float:
    y = np.asarray(y).astype(int)
    if y.sum() == 0:
        return float("nan")
    return float(average_precision_score(y, scores))
