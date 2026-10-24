"""Pembagian per eksperimen (bukan per baris), berurutan menurut waktu dalam setiap sesi.

Sesi = eksperimen yang direkam pada tanggal yang sama (pengaturan pompa yang sama).
Dalam tiap sesi, eksperimen diurutkan menurut waktu mulai: bagian awal untuk latih,
lalu validasi, satu eksperimen pemisah (purge) bila sesi cukup besar, dan bagian akhir
untuk uji. Uji selalu lebih baru daripada latih dan validasi.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

TEST_FRACTION = 0.3
VAL_FRACTION = 0.15
PURGE_MIN_SESSION = 8


@dataclass
class Split:
    train: list[str] = field(default_factory=list)
    val: list[str] = field(default_factory=list)
    purge: list[str] = field(default_factory=list)
    test: list[str] = field(default_factory=list)
    session_of: dict[str, str] = field(default_factory=dict)

    @property
    def tuning(self) -> list[str]:
        """Eksperimen yang boleh dipakai untuk memilih hiperparameter (latih + validasi)."""
        return self.train + self.val

    def to_dict(self) -> dict:
        return {
            "train": self.train,
            "val": self.val,
            "purge": self.purge,
            "test": self.test,
            "session_of": self.session_of,
        }


def sessions_by_date(starts: dict[str, pd.Timestamp]) -> dict[str, list[str]]:
    """Kelompokkan eksperimen menurut tanggal mulai; urut waktu dalam kelompok."""
    groups: dict[str, list[str]] = {}
    for exp, ts in sorted(starts.items(), key=lambda kv: kv[1]):
        groups.setdefault(ts.strftime("%Y-%m-%d"), []).append(exp)
    return groups


def build_split(starts: dict[str, pd.Timestamp]) -> Split:
    split = Split()
    for session, exps in sessions_by_date(starts).items():
        n = len(exps)
        n_test = max(1, round(TEST_FRACTION * n))
        n_purge = 1 if n >= PURGE_MIN_SESSION else 0
        n_val = max(1, round(VAL_FRACTION * n))
        n_train = n - n_test - n_purge - n_val
        if n_train < 1:
            raise ValueError(f"Sesi {session} terlalu kecil untuk dibagi ({n} eksperimen).")
        i = 0
        for name, size in (
            ("train", n_train),
            ("val", n_val),
            ("purge", n_purge),
            ("test", n_test),
        ):
            getattr(split, name).extend(exps[i : i + size])
            i += size
        for e in exps:
            split.session_of[e] = session
    return split


def timestamp_overlaps(
    starts: dict[str, pd.Timestamp], ends: dict[str, pd.Timestamp]
) -> list[tuple[str, str, float]]:
    """Pasangan eksperimen bertetangga yang cap waktunya saling tumpang tindih (detik).

    Pada SKAB ini terjadi pada beberapa pasangan, sehingga urutan antar eksperimen hanya
    memakai waktu mulai, dan eksperimen pemisah dipakai bila sesi cukup besar."""
    out = []
    for exps in sessions_by_date(starts).values():
        for a, b in zip(exps, exps[1:], strict=False):
            gap = (starts[b] - ends[a]).total_seconds()
            if gap < 0:
                out.append((a, b, -gap))
    return out


def check_no_leakage(split: Split, starts: dict[str, pd.Timestamp]) -> None:
    """Gagal bila ada eksperimen di dua himpunan, atau urutan waktu mulai dilanggar:
    validasi harus mulai setelah latih, dan uji setelah latih dan validasi."""
    sets = {"train": split.train, "val": split.val, "purge": split.purge, "test": split.test}
    seen: dict[str, str] = {}
    for name, exps in sets.items():
        for e in exps:
            if e in seen:
                raise AssertionError(f"{e} ada di {seen[e]} dan {name}")
            seen[e] = name
    for session in set(split.session_of.values()):
        by = {k: [e for e in v if split.session_of[e] == session] for k, v in sets.items()}
        if not by["test"]:
            raise AssertionError(f"sesi {session} tidak punya data uji")
        dev = by["train"] + by["val"]
        if min(starts[e] for e in by["test"]) <= max(starts[e] for e in dev):
            raise AssertionError(f"sesi {session}: uji tidak lebih baru dari latih/validasi")
        if by["val"] and min(starts[e] for e in by["val"]) <= max(starts[e] for e in by["train"]):
            raise AssertionError(f"sesi {session}: validasi tidak lebih baru dari latih")
