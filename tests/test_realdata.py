"""Tes terhadap data SKAB asli. Dilewati bila data belum diunduh (sentinel data fetch)."""

import json
from pathlib import Path

import numpy as np
import pytest

from sentinel import data
from sentinel.evaluate import MODES, load_all, scores_for
from sentinel.experiment import evaluate_set
from sentinel.metrics import aggregate
from sentinel.splits import check_no_leakage, timestamp_overlaps

DATA_DIR = data.DEFAULT_DATA_DIR
RESULTS = Path(__file__).resolve().parents[1] / "reports" / "results.json"

pytestmark = pytest.mark.realdata
needs_data = pytest.mark.skipif(not DATA_DIR.exists(), reason="data SKAB belum diunduh")


@pytest.fixture(scope="module")
def loaded():
    data.verify(DATA_DIR)
    return load_all(DATA_DIR)


@needs_data
def test_checksums_match_manifest():
    data.verify(DATA_DIR)


@needs_data
def test_dataset_structure(loaded):
    assert len(loaded.dfs) == 34
    for exp, df in loaded.dfs.items():
        assert list(df.columns) == ["datetime", *data.SENSORS, "anomaly"], exp
        assert not df[data.SENSORS].isna().any().any(), exp
        assert df["datetime"].is_monotonic_increasing and not df["datetime"].duplicated().any()
        y = df["anomaly"].to_numpy()
        assert set(np.unique(y)) <= {0, 1}
        a = int(y.argmax())
        assert y[a : a + int(y.sum())].all(), f"{exp}: anomali tidak satu segmen"
    assert sum(int(d["anomaly"].sum()) for d in loaded.dfs.values()) == 13067


@needs_data
def test_normal_only_recording_has_no_labels(loaded):
    assert loaded.normal_only["anomaly"].sum() == 0 and len(loaded.normal_only) == 9405


@needs_data
def test_split_has_no_leakage_on_real_data(loaded):
    starts = {e: d["datetime"].iloc[0] for e, d in loaded.dfs.items()}
    check_no_leakage(loaded.split, starts)
    sp = loaded.split
    assert len(sp.test) == 10 and len(sp.train) + len(sp.val) + len(sp.purge) == 24
    assert set(sp.test).isdisjoint(sp.train + sp.val + sp.purge)


@needs_data
def test_timestamp_overlaps_are_known(loaded):
    starts = {e: d["datetime"].iloc[0] for e, d in loaded.dfs.items()}
    ends = {e: d["datetime"].iloc[-1] for e, d in loaded.dfs.items()}
    pairs = {(a, b) for a, b, _ in timestamp_overlaps(starts, ends)}
    assert pairs == {
        ("other/10", "other/11"),
        ("other/12", "other/13"),
        ("other/2", "other/3"),
        ("other/3", "other/4"),
    }


@needs_data
@pytest.mark.skipif(not RESULTS.exists(), reason="belum ada reports/results.json")
@pytest.mark.parametrize("protocol", ["p1_kalibrasi_awal", "p2_riwayat_normal"])
def test_published_results_are_reproducible(loaded, protocol):
    """Hitung ulang uji untuk satu model dengan konfigurasi tersimpan; harus sama persis."""
    published = json.loads(RESULTS.read_text())
    assert published["pembagian"] == loaded.split.to_dict()
    model = "pca"
    for mode in MODES:
        s = published["protokol"][protocol][model][mode]
        scored = scores_for(loaded, protocol, model, s["jendela_fitur"])
        test = [scored[e] for e in loaded.split.test if e in scored]
        agg = aggregate(evaluate_set(test, s["ambang"], s["ketekunan_detik"], s["tahan_detik"]))
        assert agg["f1"] == pytest.approx(s["uji"]["f1"], abs=1e-9)
        assert agg["alarm_palsu_per_jam"] == pytest.approx(
            s["uji"]["alarm_palsu_per_jam"], abs=1e-9
        )
