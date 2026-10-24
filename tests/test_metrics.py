import numpy as np
import pandas as pd
import pytest

from sentinel.metrics import aggregate, evaluate_file, observed_hours, pr_auc


def times(n, start="2020-01-01 00:00:00"):
    return pd.Series(pd.date_range(start, periods=n, freq="s"))


def test_perfect_detection():
    y = np.array([0] * 10 + [1] * 10 + [0] * 10)
    r = evaluate_file("e", times(30), y, y.copy())
    assert (r.tp, r.fp, r.fn, r.tn) == (10, 0, 0, 20)
    assert r.event_detected and r.delay_seconds == 0 and r.false_episodes == 0
    a = aggregate([r])
    assert a["f1"] == 1 and a["far_persen"] == 0 and a["recall_kejadian"] == 1


def test_delay_and_false_alarm_episodes():
    y = np.array([0] * 10 + [1] * 10 + [0] * 10)
    f = np.zeros(30, dtype=bool)
    f[2:4] = True  # alarm palsu sebelum kejadian
    f[14:17] = True  # terdeteksi dengan tunda 4 detik
    f[25:27] = True  # alarm palsu sesudah kejadian
    r = evaluate_file("e", times(30), y, f)
    assert r.event_detected and r.delay_seconds == 4
    assert r.false_episodes == 2
    assert (r.fp, r.tp) == (4, 3)


def test_missed_event():
    y = np.array([0] * 5 + [1] * 5)
    r = evaluate_file("e", times(10), y, np.zeros(10, dtype=bool))
    assert not r.event_detected and r.delay_seconds is None
    assert aggregate([r])["recall_kejadian"] == 0


def test_alarm_starting_inside_event_is_not_false():
    y = np.array([0] * 5 + [1] * 5)
    f = np.array([0, 0, 0, 0, 0, 1, 1, 1, 0, 0], dtype=bool)
    r = evaluate_file("e", times(10), y, f)
    assert r.false_episodes == 0 and r.event_detected and r.delay_seconds == 0


def test_alarm_started_before_event_counts_as_false_even_if_it_continues():
    y = np.array([0] * 5 + [1] * 5)
    f = np.array([0, 0, 0, 1, 1, 1, 1, 0, 0, 0], dtype=bool)
    r = evaluate_file("e", times(10), y, f)
    assert r.false_episodes == 1 and r.event_detected


def test_always_on_alarm_is_not_free():
    y = np.array([0] * 50 + [1] * 50)
    r = evaluate_file("e", times(100), y, np.ones(100, dtype=bool))
    assert r.false_episodes == 1 and r.fp == 50


def test_observed_hours_ignores_large_gaps():
    t = pd.Series(
        pd.to_datetime(["2020-01-01 00:00:00", "2020-01-01 00:00:01", "2020-01-01 00:10:00"])
    )
    h = observed_hours(t, np.ones(3, dtype=bool))
    assert h == pytest.approx((1 + 5) / 3600)


def test_false_alarms_per_hour_uses_observed_normal_time():
    y = np.zeros(3601, dtype=int)
    y[-1] = 0
    f = np.zeros(3601, dtype=bool)
    f[100] = f[2000] = True
    r = evaluate_file("e", times(3601), y, f)
    assert aggregate([r])["alarm_palsu_per_jam"] == pytest.approx(2.0, rel=0.01)


def test_pr_auc_perfect_and_no_positives():
    y = np.array([0, 0, 1, 1])
    assert pr_auc(y, np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert np.isnan(pr_auc(np.zeros(4), np.arange(4)))
