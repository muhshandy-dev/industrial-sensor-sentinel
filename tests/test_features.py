import numpy as np

from sentinel.features import build_features


def test_raw_window_is_identity(df):
    assert build_features(df, 1).shape == (len(df), 8)


def test_window_features_shape(df):
    assert build_features(df, 10).shape == (len(df), 16)


def test_features_do_not_look_ahead(df):
    """Mengubah masa depan tidak boleh mengubah fitur masa lalu."""
    base = build_features(df, 10)
    changed = df.copy()
    changed.loc[600:, "Current"] += 1000
    after = build_features(changed, 10)
    assert np.allclose(base[:600], after[:600])
