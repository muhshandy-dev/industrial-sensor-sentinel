"""Fitur sebab-akibat: hanya memakai data sampai waktu saat ini, tidak melihat ke depan."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .data import SENSORS


def build_features(df: pd.DataFrame, window: int) -> np.ndarray:
    """window = 1 memakai nilai sensor mentah. window > 1 menambah rata-rata dan simpangan
    baku bergulir pada window detik terakhir (di dalam satu eksperimen saja)."""
    x = df[SENSORS].astype(float)
    if window <= 1:
        return x.to_numpy()
    roll = x.rolling(window, min_periods=1)
    mean = roll.mean()
    std = roll.std().fillna(0.0)
    return np.hstack([mean.to_numpy(), std.to_numpy()])
