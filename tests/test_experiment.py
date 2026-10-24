import numpy as np

from sentinel.experiment import (
    WARMUP,
    Scored,
    bootstrap_ci,
    first_anomaly,
    flags_for,
    grid,
    p1_eligible,
    pick,
    score_p1,
    score_p2_session,
)
from sentinel.metrics import FileResult

from .conftest import make_df


def test_first_anomaly_and_eligibility():
    df = make_df(anomaly=(500, 700))
    assert first_anomaly(df) == 500 and p1_eligible(df)
    early = make_df(anomaly=(100, 300))
    assert not p1_eligible(early)
    assert first_anomaly(make_df(anomaly=None)) == 900


def test_p1_evaluates_only_after_warmup_and_detects():
    df = make_df(shift=8.0)
    sc = score_p1("x", df, "ambang_statistik", 1)
    assert not sc.eval_mask[:WARMUP].any() and sc.eval_mask[WARMUP:].all()
    assert np.median(sc.score[500:700]) > 1.0 > np.median(sc.score[WARMUP:500])


def test_p1_scores_do_not_depend_on_future_labels():
    """Mengubah label dan data sesudah kalibrasi tidak boleh mengubah skor baris sebelumnya."""
    a = make_df(shift=8.0)
    b = a.copy()
    b.loc[600:, "Current"] += 50
    sa = score_p1("x", a, "pca", 10).score
    sb = score_p1("x", b, "pca", 10).score
    assert np.allclose(sa[:600], sb[:600])


def test_p2_uses_only_train_prefix_for_fit():
    dfs = {"t": make_df(seed=1), "v": make_df(seed=2, shift=8.0)}
    out = score_p2_session(dfs, ["t"], ["v"], "ambang_statistik", 1)
    sc = out["v"]
    assert sc.eval_mask.all()
    assert np.median(sc.score[500:700]) > np.median(sc.score[:500])
    # mengubah bagian anomali eksperimen latih tidak boleh mengubah model
    dfs2 = {"t": dfs["t"].copy(), "v": dfs["v"]}
    dfs2["t"].loc[500:700, "Current"] += 99
    out2 = score_p2_session(dfs2, ["t"], ["v"], "ambang_statistik", 1)
    assert np.array_equal(out["v"].score, out2["v"].score)


def test_grid_and_pick_respect_budget():
    df = make_df(shift=8.0)
    sc = [score_p1("x", df, "ambang_statistik", 1)]
    rows = grid(sc)
    best = pick(rows)
    assert best["f1"] >= pick(rows, 0.0)["f1"] - 1e-9
    assert pick(rows, 0.0)["alarm_palsu_per_jam"] == 0.0
    assert pick([], None) is None


def test_flags_masked_to_eval_rows():
    df = make_df()
    sc = Scored(
        "x",
        df["datetime"],
        df["anomaly"].to_numpy(),
        np.full(len(df), 5.0),
        np.arange(len(df)) >= 100,
    )
    fl = flags_for(sc, 1.0, 1, 0)
    assert not fl[:100].any() and fl[100:].all()


def test_bootstrap_ci_is_deterministic_and_ordered():
    res = [FileResult(f"e{i}", 5 + i, i, 3, 20, True, 2.0, 0, 0.1, 10.0) for i in range(6)]
    a = bootstrap_ci(res, n_boot=200)
    assert a == bootstrap_ci(res, n_boot=200)
    for lo, hi in a.values():
        assert lo <= hi


def test_paired_bootstrap_identical_models_has_zero_difference():
    from sentinel.experiment import paired_bootstrap_diff

    res = [FileResult(f"e{i}", 5 + i, i, 3, 20, True, 2.0, 0, 0.1, 10.0) for i in range(6)]
    d = paired_bootstrap_diff(res, res, n_boot=100)
    assert d["selisih_f1"] == 0 and d["selang_95"] == [0.0, 0.0]
