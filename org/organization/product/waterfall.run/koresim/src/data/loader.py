"""Parquet lazy loader"""
from pathlib import Path

import polars as pl

from src.config import PARQUET_PATH


class ParquetLoader:
    def __init__(self, path: Path = PARQUET_PATH):
        if not path.exists():
            raise FileNotFoundError(
                f"데이터셋 없음: {path}\n먼저 scripts/download_dataset.py 실행하세요"
            )
        self.path = path

    def scan(self) -> pl.LazyFrame:
        return pl.scan_parquet(self.path)
