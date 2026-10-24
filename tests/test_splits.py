import pandas as pd
import pytest

from sentinel.splits import (
    Split,
    build_split,
    check_no_leakage,
    sessions_by_date,
    timestamp_overlaps,
)


def starts(prefix, day, n):
    return {
        f"{prefix}/{i}": pd.Timestamp(f"2020-03-{day:02d} 10:00:00") + pd.Timedelta(minutes=10 * i)
        for i in range(n)
    }


def test_sessions_group_by_date_and_sort_by_time():
    st = {**starts("a", 9, 3), **starts("b", 1, 2)}
    groups = sessions_by_date(st)
    assert groups == {"2020-03-01": ["b/0", "b/1"], "2020-03-09": ["a/0", "a/1", "a/2"]}


def test_split_is_chronological_and_disjoint():
    st = {**starts("a", 9, 20), **starts("b", 1, 4)}
    sp = build_split(st)
    check_no_leakage(sp, st)
    all_files = sp.train + sp.val + sp.purge + sp.test
    assert sorted(all_files) == sorted(st)
    assert len(all_files) == len(set(all_files))
    assert sp.test[-1] == "a/19" and "a/0" in sp.train
    assert len(sp.purge) == 1  # sesi 20 eksperimen memakai pemisah
    small = [e for e in sp.test if e.startswith("b")]
    assert small == ["b/3"]


def test_small_session_has_no_purge():
    st = starts("b", 1, 4)
    sp = build_split(st)
    assert sp.purge == [] and sp.train and sp.val and sp.test


def test_too_small_session_fails():
    with pytest.raises(ValueError):
        build_split(starts("x", 1, 2))


def test_leakage_check_detects_duplicates_and_bad_order():
    st = starts("a", 9, 10)
    sp = build_split(st)
    bad = Split(**{**sp.__dict__, "test": sp.test + [sp.train[0]]})
    with pytest.raises(AssertionError):
        check_no_leakage(bad, st)
    swapped = Split(
        train=sp.test, val=sp.val, purge=sp.purge, test=sp.train, session_of=sp.session_of
    )
    with pytest.raises(AssertionError):
        check_no_leakage(swapped, st)


def test_timestamp_overlaps_reported():
    st = {"x/0": pd.Timestamp("2020-03-01 10:00:00"), "x/1": pd.Timestamp("2020-03-01 10:10:00")}
    en = {"x/0": pd.Timestamp("2020-03-01 10:12:00"), "x/1": pd.Timestamp("2020-03-01 10:20:00")}
    assert timestamp_overlaps(st, en) == [("x/0", "x/1", 120.0)]
