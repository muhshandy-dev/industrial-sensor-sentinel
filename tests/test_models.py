import numpy as np
import pytest

from sentinel.features import build_features
from sentinel.models import MODELS, ScoreNormalizer, Standardizer, make_model

from .conftest import make_df


@pytest.mark.parametrize("name", list(MODELS))
def test_models_score_anomaly_higher_than_normal(name):
    df = make_df(n=900, anomaly=(500, 700), shift=8.0)
    x = build_features(df, 1)
    m = make_model(name, seed=0).fit(x[:300])
    s = m.score(x)
    assert s.shape == (900,)
    assert np.median(s[500:700]) > np.median(s[300:500])


@pytest.mark.parametrize("name", list(MODELS))
def test_models_are_deterministic(name):
    df = make_df()
    x = build_features(df, 1)
    a = make_model(name, seed=3).fit(x[:300]).score(x)
    b = make_model(name, seed=3).fit(x[:300]).score(x)
    assert np.array_equal(a, b)


def test_fit_never_sees_labels():
    """fit hanya menerima matriks fitur; label tidak ikut."""
    import inspect

    for cls in MODELS.values():
        assert list(inspect.signature(cls.fit).parameters) == ["self", "x"]


def test_standardizer_handles_constant_column():
    x = np.ones((10, 2))
    z = Standardizer().fit(x).transform(x)
    assert np.isfinite(z).all()


def test_normalizer_scales_median_to_zero_and_q99_to_one():
    s = np.linspace(0, 10, 1001)
    n = ScoreNormalizer().fit(s)
    t = n.transform(s)
    assert abs(np.median(t)) < 1e-9
    assert np.quantile(t, 0.99) == pytest.approx(1.0)
