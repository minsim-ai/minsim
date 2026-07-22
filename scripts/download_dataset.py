"""Download Nemotron Personas country datasets to local parquet files.

Usage:
  uv run python scripts/download_dataset.py --country kr
  uv run python scripts/download_dataset.py --country all
  uv run python scripts/download_dataset.py --country us,jp,sg
  uv run python scripts/download_dataset.py --list
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.data.datasets import (  # noqa: E402
    DEFAULT_COUNTRY_ID,
    get_dataset,
    list_datasets,
)

DATA_DIR = PROJECT_ROOT / "data" / "personas"
LEGACY_KR_CANDIDATES = [
    PROJECT_ROOT / "data" / "nemotron_korea_personas.parquet",
    PROJECT_ROOT.parent / "koresim" / "data" / "nemotron_korea_personas.parquet",
    PROJECT_ROOT.parent / "koresim-v2" / "data" / "nemotron_korea_personas.parquet",
]


def _target_path(country_id: str) -> Path:
    dataset = get_dataset(country_id)
    return DATA_DIR / dataset.country_id / dataset.filename


def _link_or_copy_legacy_kr(target: Path) -> bool:
    if target.exists():
        return True
    for candidate in LEGACY_KR_CANDIDATES:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if not resolved.exists() or not resolved.is_file():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            target.symlink_to(resolved)
            print(f"[kr] linked existing parquet: {resolved} -> {target}")
            return True
        except OSError:
            shutil.copy2(resolved, target)
            print(f"[kr] copied existing parquet: {resolved} -> {target}")
            return True
    return False


def download_one(country_id: str, *, force: bool = False) -> Path:
    dataset = get_dataset(country_id)
    target = _target_path(dataset.country_id)
    if target.exists() and not force:
        size_gb = target.stat().st_size / 1e9
        print(f"[{dataset.country_id}] already exists: {target} ({size_gb:.2f} GB)")
        return target

    if dataset.country_id == DEFAULT_COUNTRY_ID and not force:
        if _link_or_copy_legacy_kr(target):
            return target

    from datasets import concatenate_datasets, load_dataset

    print(f"[{dataset.country_id}] downloading {dataset.hf_id} ...")
    # Most country datasets expose `train`. India uses language-locale splits.
    try:
        hf_dataset = load_dataset(dataset.hf_id, split="train")
    except ValueError as exc:
        message = str(exc)
        if "Unknown split" not in message and "Should be one of" not in message:
            raise
        bundle = load_dataset(dataset.hf_id)
        split_names = list(bundle.keys())
        print(f"[{dataset.country_id}] no train split; concatenating {split_names}")
        parts = [bundle[name] for name in split_names]
        hf_dataset = concatenate_datasets(parts) if len(parts) > 1 else parts[0]
    print(f"[{dataset.country_id}] rows={len(hf_dataset):,} columns={hf_dataset.column_names}")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".parquet.partial")
    if tmp.exists():
        tmp.unlink()
    hf_dataset.to_parquet(str(tmp))
    tmp.replace(target)
    size_gb = target.stat().st_size / 1e9
    print(f"[{dataset.country_id}] saved: {target} ({size_gb:.2f} GB)")
    return target


def parse_countries(raw: str) -> list[str]:
    value = raw.strip().lower()
    if value in {"all", "*"}:
        return [item.country_id for item in list_datasets()]
    parts = [part.strip().lower() for part in value.split(",") if part.strip()]
    if not parts:
        raise ValueError("No countries specified")
    # Validate
    for part in parts:
        get_dataset(part)
    return parts


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Nemotron Personas datasets")
    parser.add_argument(
        "--country",
        default="all",
        help="Country id(s): kr,us,jp,... or all (default: all)",
    )
    parser.add_argument("--force", action="store_true", help="Re-download even if file exists")
    parser.add_argument("--list", action="store_true", help="List registered datasets and exit")
    args = parser.parse_args()

    if args.list:
        for dataset in list_datasets():
            path = _target_path(dataset.country_id)
            status = "ready" if path.exists() else "missing"
            print(
                f"{dataset.country_id:3}  {dataset.country_name:16}  "
                f"{dataset.hf_id:42}  {status:7}  {path}"
            )
        return

    countries = parse_countries(args.country)
    print(f"Downloading {len(countries)} dataset(s): {', '.join(countries)}")
    failures: list[str] = []
    for country_id in countries:
        try:
            download_one(country_id, force=args.force)
        except Exception as exc:  # noqa: BLE001 - report and continue batch
            failures.append(f"{country_id}: {exc}")
            print(f"[{country_id}] FAILED: {exc}", file=sys.stderr)

    print("\n=== Summary ===")
    for country_id in countries:
        path = _target_path(country_id)
        if path.exists():
            print(f"  OK   {country_id}  {path.stat().st_size / 1e9:.2f} GB  {path}")
        else:
            print(f"  MISS {country_id}  {path}")
    if failures:
        print("\nFailures:")
        for item in failures:
            print(f"  - {item}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
