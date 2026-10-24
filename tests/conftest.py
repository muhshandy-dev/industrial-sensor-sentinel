import numpy as np
import pandas as pd
import pytest

from sentinel.data import SENSORS


def make_df(n=900, anomaly=(500, 700), seed=0, shift=4.0, start="2020-03-09 10:00:00"):
    """Eksperimen sintetis: sensor normal berderau, anomali menggeser sensor pertama."""
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 1, (n, len(SENSORS))) * 0.05 + np.arange(len(SENSORS)) + 10
    y = np.zeros(n, dtype=int)
    if anomaly:
        a, b = anomaly
        y[a:b] = 1
        x[a:b, 0] += shift * 0.05 * 5
    df = pd.DataFrame(x, columns=SENSORS)
    df.insert(0, "datetime", pd.date_range(start, periods=n, freq="s"))
    df["anomaly"] = y
    return df


@pytest.fixture
def df():
    return make_df()
