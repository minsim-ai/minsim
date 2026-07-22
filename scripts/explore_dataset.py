"""데이터셋 구조 탐색 — 다운로드 후 실행

Usage:
  uv run python scripts/explore_dataset.py
  uv run python scripts/explore_dataset.py --country us
  uv run python scripts/explore_dataset.py --country all
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import polars as pl

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.data.datasets import get_dataset, list_datasets  # noqa: E402


def explore_one(country_id: str) -> None:
    dataset = get_dataset(country_id)
    path = dataset.resolved_path()
    print(f"\n===== {dataset.country_id} / {dataset.country_name} =====")
    print(f"path: {path}")
    if not path.exists():
        print("MISSING — run scripts/download_dataset.py first")
        return

    lf = pl.scan_parquet(path)
    schema = lf.collect_schema()
    height = lf.select(pl.len()).collect().item()
    print(f"rows: {height:,} | columns: {len(schema)}")
    print("columns:")
    for name, dtype in schema.items():
        print(f"  {name}: {dtype}")

    sample = lf.head(2).collect()
    print("\nsample rows (truncated):")
    for col in list(schema.names())[:12]:
        values = sample[col].to_list()
        print(f"  {col}: {values}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--country", default="kr", help="country id or all")
    args = parser.parse_args()
    if args.country.strip().lower() in {"all", "*"}:
        for dataset in list_datasets():
            explore_one(dataset.country_id)
        return
    explore_one(args.country)


if __name__ == "__main__":
    main()
