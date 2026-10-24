"""Tes modul pendukung: profil, verifikasi data, CLI, analisis kesalahan, dan ekspor website."""

import json

import pytest

from sentinel import data
from sentinel.cli import main
from sentinel.error_analysis import analyse_run
from sentinel.evaluate import ChosenRun, load_all, scores_for
from sentinel.export_web import export_experiment
from sentinel.profile import profile_experiment, run_profile

from .conftest import make_df

needs_data = pytest.mark.skipif(
    not data.DEFAULT_DATA_DIR.exists(), reason="data SKAB belum diunduh"
)


def test_profile_experiment_on_synthetic_data():
    p = profile_experiment("x", make_df(shift=8.0))
    assert p["baris"] == 900 and p["baris_anomali"] == 200
    assert p["anomali_satu_segmen"] and p["baris_normal_sebelum"] == 500
    assert p["pergeseran_terbesar_sensor"] == "Accelerometer1RMS"
    assert p["celah_lebih_dari_5_detik"] == 0 and p["cap_waktu_ganda"] == 0


def test_profile_experiment_without_labels():
    p = profile_experiment("x", make_df(anomaly=None))
    assert p["baris_anomali"] == 0 and "awal_anomali_detik" not in p


def test_verify_detects_missing_and_modified_files(tmp_path):
    for exp in data.ALL_FILES:
        (tmp_path / f"{exp}.csv").parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / f"{exp}.csv").write_text("x")
    manifest = tmp_path / "m.json"
    manifest.write_text(json.dumps(data.build_manifest(tmp_path)))
    data.verify(tmp_path, manifest)
    (tmp_path / "valve1" / "0.csv").write_text("diubah")
    with pytest.raises(ValueError, match="valve1/0"):
        data.verify(tmp_path, manifest)
    (tmp_path / "valve1" / "1.csv").unlink()
    with pytest.raises(ValueError, match="valve1/1"):
        data.verify(tmp_path, manifest)


def test_verify_rejects_manifest_for_other_commit(tmp_path):
    m = tmp_path / "m.json"
    m.write_text(json.dumps({"commit": "bukan-commit-ini", "files": {}}))
    with pytest.raises(ValueError, match="commit"):
        data.verify(tmp_path, m)


def test_cli_requires_valid_data(tmp_path):
    with pytest.raises(ValueError):
        main(["evaluate", "--data-dir", str(tmp_path)])


@needs_data
def test_cli_verify_on_real_data(capsys):
    assert main(["data", "verify"]) == 0
    assert "sesuai manifest" in capsys.readouterr().out


@needs_data
def test_profile_on_real_data_matches_data_card():
    p = run_profile(data.DEFAULT_DATA_DIR)
    assert p["jumlah_berkas"] == 35 and p["eksperimen_berlabel"] == 34
    assert p["total_baris_berlabel"] == 37401 and p["total_baris_anomali"] == 13067
    assert len(p["cap_waktu_tumpang_tindih"]) == 4
    assert p["rekaman_normal_tumpang_tindih_dengan"] == ["other/5"]
    assert all(v["nilai_kosong"] == 0 for v in p["per_berkas"].values())


@needs_data
def test_error_analysis_and_export_on_real_data():
    loaded = load_all(data.DEFAULT_DATA_DIR)
    scored = scores_for(loaded, "p1_kalibrasi_awal", "ambang_statistik", 10)
    run = ChosenRun(
        protocol="p1_kalibrasi_awal",
        model="ambang_statistik",
        window=10,
        threshold=4.17,
        persistence=1,
        hold=0,
        scored=scored,
    )
    prof = run_profile(data.DEFAULT_DATA_DIR)["per_berkas"]
    a = analyse_run(run, loaded, prof)
    assert len(a["per_eksperimen"]) == 10
    assert all("skenario" in r for r in a["per_eksperimen"])
    runs = {("p1_kalibrasi_awal", "ambang_statistik", "sensitif"): run}
    exp = export_experiment(loaded.split.test[0], loaded, runs)
    assert exp["kalibrasi_baris"] == 300 and len(exp["detik"]) == exp["baris"]
    assert set(exp["sensor"]) == set(data.SENSORS)
    m = exp["model"]["ambang_statistik"]["sensitif"]
    assert len(m["skor"]) == exp["baris"]
