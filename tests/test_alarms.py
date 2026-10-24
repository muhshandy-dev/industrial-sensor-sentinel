import numpy as np

from sentinel.alarms import episodes, hold, persist, to_alarm


def test_persist_needs_consecutive_samples():
    f = np.array([1, 1, 0, 1, 1, 1, 1], dtype=bool)
    assert persist(f, 3).tolist() == [False, False, False, False, False, True, True]
    assert persist(f, 1).tolist() == f.tolist()


def test_persist_is_causal():
    f = np.array([0, 0, 1, 1, 1, 0, 0], dtype=bool)
    out = persist(f, 2)
    # sampel ke-3 (indeks 2) belum boleh menyala hanya karena sampel sesudahnya menyala
    assert not out[2]
    assert out[3]


def test_hold_merges_flicker_and_is_causal():
    f = np.array([1, 0, 1, 0, 0, 0, 0], dtype=bool)
    assert hold(f, 1).tolist() == [True, True, True, True, False, False, False]
    assert not hold(np.array([0, 0, 1], dtype=bool), 5)[1]


def test_episodes():
    f = np.array([0, 1, 1, 0, 1, 0, 1, 1], dtype=bool)
    assert episodes(f) == [(1, 2), (4, 4), (6, 7)]
    assert episodes(np.zeros(3, dtype=bool)) == []


def test_to_alarm_combines_steps():
    s = np.array([0, 2, 2, 0, 0, 2, 2, 2, 0], dtype=float)
    assert to_alarm(s, 1.0, 2, 1).tolist() == [
        False,
        False,
        True,
        True,
        False,
        False,
        True,
        True,
        True,
    ]
