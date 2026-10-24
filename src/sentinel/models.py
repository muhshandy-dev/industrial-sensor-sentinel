"""Tiga detektor tanpa label: ambang statistik, PCA (T2 + Q), dan Isolation Forest.

Semua model hanya dilatih pada data normal. Label tidak pernah dipakai saat fit.
"""

from __future__ import annotations

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest

SD_FLOOR = 1e-6
REF_QUANTILE = 0.99


class Standardizer:
    def fit(self, x: np.ndarray) -> Standardizer:
        self.mean_ = x.mean(axis=0)
        self.std_ = np.maximum(x.std(axis=0), SD_FLOOR)
        return self

    def transform(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean_) / self.std_


class ZScoreModel:
    """Ambang statistik: skor = |z| terbesar di antara semua fitur."""

    name = "ambang_statistik"

    def fit(self, x: np.ndarray) -> ZScoreModel:
        self.scaler_ = Standardizer().fit(x)
        return self

    def score(self, x: np.ndarray) -> np.ndarray:
        return np.abs(self.scaler_.transform(x)).max(axis=1)

    def contributions(self, x: np.ndarray) -> np.ndarray:
        return np.abs(self.scaler_.transform(x))


class PCAModel:
    """PCA: skor = yang terbesar antara T2 dan Q, masing-masing dibagi acuan persentil 99
    pada data latih. Komponen dipilih untuk menjelaskan 95 persen ragam data latih."""

    name = "pca"

    def __init__(self, variance: float = 0.95):
        self.variance = variance

    def fit(self, x: np.ndarray) -> PCAModel:
        self.scaler_ = Standardizer().fit(x)
        z = self.scaler_.transform(x)
        self.pca_ = PCA(n_components=self.variance, svd_solver="full").fit(z)
        t2, q = self._stats(z)
        self.t2_ref_ = max(np.quantile(t2, REF_QUANTILE), 1e-12)
        self.q_ref_ = max(np.quantile(q, REF_QUANTILE), 1e-12)
        return self

    def _stats(self, z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        scores = self.pca_.transform(z)
        var = np.maximum(self.pca_.explained_variance_, 1e-12)
        t2 = ((scores**2) / var).sum(axis=1)
        resid = z - self.pca_.inverse_transform(scores)
        return t2, (resid**2).sum(axis=1)

    def score(self, x: np.ndarray) -> np.ndarray:
        t2, q = self._stats(self.scaler_.transform(x))
        return np.maximum(t2 / self.t2_ref_, q / self.q_ref_)


class IsolationForestModel:
    name = "isolation_forest"

    def __init__(self, seed: int = 0, n_estimators: int = 200):
        self.seed = seed
        self.n_estimators = n_estimators

    def fit(self, x: np.ndarray) -> IsolationForestModel:
        self.scaler_ = Standardizer().fit(x)
        self.forest_ = IsolationForest(
            n_estimators=self.n_estimators, random_state=self.seed, n_jobs=1
        ).fit(self.scaler_.transform(x))
        return self

    def score(self, x: np.ndarray) -> np.ndarray:
        return -self.forest_.score_samples(self.scaler_.transform(x))


MODELS = {
    "ambang_statistik": ZScoreModel,
    "pca": PCAModel,
    "isolation_forest": IsolationForestModel,
}


def make_model(name: str, seed: int = 0):
    cls = MODELS[name]
    return cls(seed=seed) if name == "isolation_forest" else cls()


class ScoreNormalizer:
    """Skala skor memakai data kalibrasi normal yang tidak dipakai fit: 0 di median dan 1 di
    persentil 99, sehingga satu ambang relatif berlaku untuk semua eksperimen dan model."""

    def fit(self, cal_scores: np.ndarray) -> ScoreNormalizer:
        self.median_ = float(np.median(cal_scores))
        q99 = float(np.quantile(cal_scores, REF_QUANTILE))
        self.span_ = max(q99 - self.median_, 1e-12)
        return self

    def transform(self, s: np.ndarray) -> np.ndarray:
        return (s - self.median_) / self.span_
