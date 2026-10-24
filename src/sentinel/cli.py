"""Antarmuka baris perintah: sentinel data fetch|verify, sentinel evaluate."""

from __future__ import annotations

import argparse
from pathlib import Path

from . import data
from .error_analysis import analyse_all
from .evaluate import run_all, write_results
from .export_web import export_web
from .profile import run_profile, write_profile


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="sentinel")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("data", help="unduh atau verifikasi data SKAB")
    d.add_argument("action", choices=["fetch", "verify"])
    d.add_argument("--data-dir", type=Path, default=data.DEFAULT_DATA_DIR)

    e = sub.add_parser("evaluate", help="jalankan seluruh eksperimen dan tulis laporan JSON")
    e.add_argument("--data-dir", type=Path, default=data.DEFAULT_DATA_DIR)
    e.add_argument("--out", type=Path, default=Path("reports/results.json"))
    e.add_argument("--web-out", type=Path, default=None, help="folder data statis website")

    r = sub.add_parser("profile", help="profil data SKAB")
    r.add_argument("--data-dir", type=Path, default=data.DEFAULT_DATA_DIR)
    r.add_argument("--out", type=Path, default=Path("reports/data_profile.json"))

    args = ap.parse_args(argv)
    if args.cmd == "data":
        (data.fetch if args.action == "fetch" else data.verify)(args.data_dir)
        print("data SKAB sesuai manifest")
        return 0
    data.verify(args.data_dir)
    if args.cmd == "profile":
        write_profile(run_profile(args.data_dir), args.out)
        print(f"profil ditulis ke {args.out}")
        return 0
    results, runs, loaded = run_all(args.data_dir)
    write_results(results, args.out)
    profile = run_profile(args.data_dir)
    errors = analyse_all(runs, loaded, profile)
    write_results(errors, args.out.with_name("error_analysis.json"))
    if args.web_out:
        export_web(args.web_out, results, errors, profile, runs, loaded)
    print(f"hasil ditulis ke {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
