"""Dari skor ke peringatan: ambang, ketekunan, dan episode peringatan."""

from __future__ import annotations

import numpy as np


def persist(flags: np.ndarray, p: int) -> np.ndarray:
    """Peringatan baru menyala setelah p sampel berturut-turut melewati ambang
    (sebab-akibat: sampel ke p ikut menyala, sampel sebelumnya tidak ditandai mundur)."""
    flags = np.asarray(flags, dtype=bool)
    if p <= 1:
        return flags
    idx = np.arange(len(flags))
    last_false = np.maximum.accumulate(np.where(flags, -1, idx))
    return flags & ((idx - last_false) >= p)


def hold(flags: np.ndarray, h: int) -> np.ndarray:
    """Peringatan bertahan h sampel setelah lewat ambang terakhir, agar alarm yang berkedip
    dihitung sebagai satu episode (sebab-akibat)."""
    flags = np.asarray(flags, dtype=bool)
    if h <= 0:
        return flags
    c = np.concatenate([[0], np.cumsum(flags)])
    idx = np.arange(1, len(flags) + 1)
    return (c[idx] - c[np.maximum(idx - h - 1, 0)]) > 0


def to_alarm(score: np.ndarray, threshold: float, p: int, h: int) -> np.ndarray:
    return hold(persist(score > threshold, p), h)


def episodes(flags: np.ndarray) -> list[tuple[int, int]]:
    """Rentang (awal, akhir) inklusif untuk tiap rangkaian True yang berurutan."""
    flags = np.asarray(flags, dtype=bool)
    d = np.diff(np.concatenate([[0], flags.astype(np.int8), [0]]))
    starts = np.flatnonzero(d == 1)
    ends = np.flatnonzero(d == -1) - 1
    return list(zip(starts.tolist(), ends.tolist(), strict=True))
