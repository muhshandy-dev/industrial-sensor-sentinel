"""Pengambilan, verifikasi, dan pemuatan data SKAB pada commit yang dikunci."""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

SKAB_REPO = "waico/SKAB"
SKAB_COMMIT = "b2c0d46c2971dcbfe71e26087b6d231998bb91c2"
RAW_URL = "https://raw.githubusercontent.com/{repo}/{commit}/data/{path}.csv"

SENSORS = [
    "Accelerometer1RMS",
    "Accelerometer2RMS",
    "Current",
    "Pressure",
    "Temperature",
    "Thermocouple",
    "Voltage",
    "Volume Flow RateRMS",
]

# 34 eksperimen berlabel + 1 rekaman normal tanpa label.
EXPERIMENTS = (
    [f"valve1/{i}" for i in range(16)]
    + [f"valve2/{i}" for i in range(4)]
    + [f"other/{i}" for i in range(1, 15)]
)
NORMAL_ONLY = "anomaly-free/anomaly-free"
ALL_FILES = [*EXPERIMENTS, NORMAL_ONLY]

DEFAULT_DATA_DIR = Path("data/raw/skab")
MANIFEST_PATH = Path(__file__).resolve().parents[2] / "data" / "skab_manifest.json"


def file_path(data_dir: Path, exp: str) -> Path:
    return Path(data_dir) / f"{exp}.csv"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path, retries: int = 4) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 (https tetap)
                dest.write_bytes(r.read())
            return
        except OSError:
            if attempt == retries - 1:
                raise
            time.sleep(2 * 2**attempt)


def fetch(data_dir: Path = DEFAULT_DATA_DIR) -> None:
    """Unduh semua berkas dari commit yang dikunci, lalu verifikasi dengan manifest."""
    for exp in ALL_FILES:
        dest = file_path(data_dir, exp)
        if not dest.exists():
            url = RAW_URL.format(repo=SKAB_REPO, commit=SKAB_COMMIT, path=exp)
            _download(url, dest)
    verify(data_dir)


def build_manifest(data_dir: Path = DEFAULT_DATA_DIR) -> dict:
    files = {exp: sha256_of(file_path(data_dir, exp)) for exp in ALL_FILES}
    return {"repo": SKAB_REPO, "commit": SKAB_COMMIT, "license": "GPL-3.0", "files": files}


def verify(data_dir: Path = DEFAULT_DATA_DIR, manifest_path: Path = MANIFEST_PATH) -> None:
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest["commit"] != SKAB_COMMIT:
        raise ValueError("Manifest tidak cocok dengan commit SKAB yang dikunci.")
    bad = []
    for exp, expected in manifest["files"].items():
        p = file_path(data_dir, exp)
        if not p.exists() or sha256_of(p) != expected:
            bad.append(exp)
    if bad:
        raise ValueError(f"Berkas data hilang atau checksum salah: {', '.join(bad)}")


def load_experiment(data_dir: Path, exp: str) -> pd.DataFrame:
    """Muat satu eksperimen. Kolom: datetime, 8 sensor, anomaly (0 jika tidak ada label)."""
    df = pd.read_csv(file_path(data_dir, exp), sep=";", parse_dates=["datetime"])
    if "anomaly" not in df:
        df["anomaly"] = 0.0
    df["anomaly"] = df["anomaly"].astype(int)
    df = df.drop(columns=[c for c in ("changepoint",) if c in df])
    return df.reset_index(drop=True)


# Skenario tiap eksperimen menurut README SKAB (data/README.md), diringkas dalam bahasa Indonesia.
SCENARIOS = {
    **{f"valve1/{i}": "Katup di sisi masuk pompa ditutup" for i in range(16)},
    **{f"valve2/{i}": "Katup di sisi keluaran pompa ditutup" for i in range(4)},
    "other/1": "Simulasi kebocoran dan penambahan cairan",
    "other/2": "Simulasi kebocoran dan penambahan cairan",
    "other/3": "Simulasi kebocoran dan penambahan cairan",
    "other/4": "Simulasi kebocoran dan penambahan cairan",
    "other/5": "Rotor tidak seimbang, perubahan tajam",
    "other/6": "Rotor tidak seimbang, perubahan linear",
    "other/7": "Rotor tidak seimbang, perubahan bertahap",
    "other/8": "Rotor tidak seimbang, lonjakan sesaat",
    "other/9": "Rotor tidak seimbang, perubahan eksponensial",
    "other/10": "Jumlah air dalam sirkuit bertambah perlahan",
    "other/11": "Jumlah air dalam sirkuit bertambah mendadak",
    "other/12": "Air tangki dikuras hingga kavitasi",
    "other/13": "Aliran dua fase ke sisi masuk pompa (kavitasi)",
    "other/14": "Air bersuhu lebih tinggi dialirkan",
}
