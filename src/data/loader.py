"""Parquet lazy loader for multi-country persona datasets."""
from pathlib import Path

import polars as pl

from src.config import PARQUET_PATH
from src.data.datasets import DEFAULT_COUNTRY_ID, get_dataset


class ParquetLoader:
    def __init__(
        self,
        path: Path | None = None,
        country_id: str | None = None,
    ):
        if path is not None:
            resolved = Path(path)
            self.country_id = country_id or DEFAULT_COUNTRY_ID
        else:
            dataset = get_dataset(country_id or DEFAULT_COUNTRY_ID)
            resolved = dataset.resolved_path()
            self.country_id = dataset.country_id
            # Final fallback for environments that still only set PARQUET_PATH
            if not resolved.exists() and PARQUET_PATH.exists() and self.country_id == DEFAULT_COUNTRY_ID:
                resolved = PARQUET_PATH

        if not resolved.exists():
            raise FileNotFoundError(
                f"데이터셋 없음: {resolved}\n"
                f"먼저 `uv run python scripts/download_dataset.py --country {self.country_id}` 실행하세요"
            )
        self.path = resolved

    def scan(self) -> pl.LazyFrame:
        return pl.scan_parquet(self.path)
