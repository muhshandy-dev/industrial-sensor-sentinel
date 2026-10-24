"""Orkestrasi: muat data, bagi per eksperimen, setel pada validasi, nilai sekali pada uji."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from . import __version__
from .data import EXPERIMENTS, NORMAL_ONLY, SKAB_COMMIT, load_experiment
from .experiment import (
    HOLD,
    MAX_FALSE_PER_HOUR,
    PERSISTENCE,
    THRESHOLDS,
    WARMUP,
    WINDOWS,
    Scored,
    bootstrap_ci,
    evaluate_set,
    grid,
    p1_eligible,
    paired_bootstrap_diff,
    pick,
    pooled_pr_auc,
    prevalence,
    score_p1,
    score_p2_session,
)
from .metrics import FileResult, aggregate
from .models import MODELS
from .splits import Split, build_split, check_no_leakage

PROTOCOLS = ("p1_kalibrasi_awal", "p2_riwayat_normal")
SEED = 0


@dataclass
class Loaded:
    dfs: dict[str, pd.DataFrame]
    split: Split
    normal_only: pd.DataFrame


@dataclass
class ChosenRun:
    protocol: str
    model: str
    window: int
    threshold: float
    persistence: int
    hold: int = 0
    scored: dict[str, Scored] = field(default_factory=dict)


def load_all(data_dir: Path) -> Loaded:
    dfs = {e: load_experiment(data_dir, e) for e in EXPERIMENTS}
    starts = {e: d["datetime"].iloc[0] for e, d in dfs.items()}
    split = build_split(starts)
    check_no_leakage(split, starts)
    normal = load_experiment(data_dir, NORMAL_ONLY)
    return Loaded(dfs, split, normal)


def _p2_extra_normal(loaded: Loaded, session: str) -> list[pd.DataFrame]:
    """Rekaman normal tanpa label dipakai hanya bila lebih awal dari seluruh eksperimen uji sesi."""
    n = loaded.normal_only
    if n["datetime"].iloc[0].strftime("%Y-%m-%d") != session:
        return []
    first_test = min(
        loaded.dfs[e]["datetime"].iloc[0]
        for e in loaded.split.test
        if loaded.split.session_of[e] == session
    )
    if n["datetime"].iloc[-1] >= first_test:
        raise AssertionError("rekaman normal tumpang tindih dengan eksperimen uji")
    return [n]


def scores_for(loaded: Loaded, protocol: str, model: str, window: int) -> dict[str, Scored]:
    sp = loaded.split
    if protocol == "p1_kalibrasi_awal":
        exps = [e for e in sp.tuning + sp.test if p1_eligible(loaded.dfs[e])]
        return {e: score_p1(e, loaded.dfs[e], model, window, SEED) for e in exps}
    out: dict[str, Scored] = {}
    for session in sorted(set(sp.session_of.values())):
        train = [e for e in sp.train if sp.session_of[e] == session]
        targets = [e for e in sp.val + sp.test if sp.session_of[e] == session]
        out.update(
            score_p2_session(
                loaded.dfs, train, targets, model, window, _p2_extra_normal(loaded, session), SEED
            )
        )
    return out


MODES = {"sensitif": None, "hemat_alarm": MAX_FALSE_PER_HOUR}


def _config(row: dict) -> dict:
    return {k: row[k] for k in ("threshold", "persistence", "hold")}


def select_and_test(loaded: Loaded, protocol: str, model: str) -> tuple[dict, dict[str, ChosenRun]]:
    """Pilih jendela fitur, ambang, ketekunan, dan tahan pada himpunan penyetelan, per mode."""
    sp = loaded.split
    tuning_set = sp.tuning if protocol == "p1_kalibrasi_awal" else sp.val
    per_window = {}
    for w in WINDOWS:
        sc = scores_for(loaded, protocol, model, w)
        tune_scored = [sc[e] for e in tuning_set if e in sc]
        per_window[w] = (sc, tune_scored, grid(tune_scored))
    out: dict = {}
    runs: dict[str, ChosenRun] = {}
    for mode, budget in MODES.items():
        cands = []
        for w, (_sc, _, rows) in per_window.items():
            best = pick(rows, budget)
            if best is not None:
                cands.append((best["f1"], -w, w, best))
        if not cands:
            out[mode] = None
            continue
        _, _, window, best = max(cands, key=lambda c: c[:2])
        sc, tune_scored, _ = per_window[window]
        test_scored = [sc[e] for e in sp.test if e in sc]
        cfg = _config(best)
        test_res = evaluate_set(test_scored, cfg["threshold"], cfg["persistence"], cfg["hold"])
        tune_res = evaluate_set(tune_scored, cfg["threshold"], cfg["persistence"], cfg["hold"])
        out[mode] = {
            "jendela_fitur": window,
            "ambang": cfg["threshold"],
            "ketekunan_detik": cfg["persistence"],
            "tahan_detik": cfg["hold"],
            "ambang_di_tepi_grid": cfg["threshold"] in (THRESHOLDS[0], THRESHOLDS[-1]),
            "penyetelan": {
                **aggregate(tune_res),
                "pr_auc": pooled_pr_auc(tune_scored),
                "eksperimen": [s.exp for s in tune_scored],
            },
            "f1_penyetelan_per_jendela": {
                str(c[2]): round(c[0], 4) for c in sorted(cands, key=lambda c: c[2])
            },
            "uji": {
                **aggregate(test_res),
                "pr_auc": pooled_pr_auc(test_scored),
                "prevalensi_anomali": prevalence(test_scored),
                "selang_95": bootstrap_ci(test_res),
            },
            "uji_per_eksperimen": [r.to_dict() for r in test_res],
        }
        runs[mode] = ChosenRun(
            protocol=protocol,
            model=model,
            window=window,
            threshold=cfg["threshold"],
            persistence=cfg["persistence"],
            hold=cfg["hold"],
            scored=sc,
        )
    return out, runs


def run_all(data_dir: Path) -> tuple[dict, dict[tuple[str, str, str], ChosenRun], Loaded]:
    loaded = load_all(data_dir)
    results: dict = {
        "versi_kode": __version__,
        "data": {"repo": "waico/SKAB", "commit": SKAB_COMMIT, "lisensi": "GPL-3.0"},
        "pembagian": loaded.split.to_dict(),
        "kalibrasi_awal_detik": WARMUP,
        "grid": {
            "ambang": [float(THRESHOLDS[0]), float(THRESHOLDS[-1])],
            "ketekunan_detik": list(PERSISTENCE),
            "tahan_detik": list(HOLD),
            "batas_alarm_palsu_per_jam_mode_hemat": MAX_FALSE_PER_HOUR,
        },
        "protokol": {},
    }
    runs: dict[tuple[str, str, str], ChosenRun] = {}
    for protocol in PROTOCOLS:
        results["protokol"][protocol] = {}
        for model in MODELS:
            summary, mode_runs = select_and_test(loaded, protocol, model)
            results["protokol"][protocol][model] = summary
            for mode, run in mode_runs.items():
                runs[(protocol, model, mode)] = run
    results["perbandingan_berpasangan"] = _paired(results)
    return results, runs, loaded


def _paired(results: dict) -> dict:
    """Selisih F1 uji terhadap baseline ambang statistik, per protokol dan mode."""
    out: dict = {}
    for protocol, models in results["protokol"].items():
        for mode in MODES:
            base = models["ambang_statistik"][mode]
            if base is None:
                continue
            base_res = [FileResult(**r) for r in base["uji_per_eksperimen"]]
            for model in ("pca", "isolation_forest"):
                cur = models[model][mode]
                if cur is None:
                    continue
                cur_res = [FileResult(**r) for r in cur["uji_per_eksperimen"]]
                key = f"{protocol}|{mode}|{model}_dikurangi_ambang_statistik"
                out[key] = paired_bootstrap_diff(cur_res, base_res)
    return out


def write_results(results: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
