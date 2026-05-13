"""데이터셋 구조 탐색 — 다운로드 후 실행"""
from pathlib import Path
import polars as pl

PARQUET_PATH = Path(__file__).parent.parent / "data" / "nemotron_korea_personas.parquet"


def explore():
    if not PARQUET_PATH.exists():
        print("먼저 download_dataset.py를 실행하세요")
        return

    df = pl.read_parquet(PARQUET_PATH)

    print("\n=== 기본 정보 ===")
    print(f"행 수: {df.height:,} | 컬럼 수: {df.width}")
    print("\n=== 컬럼 목록 ===")
    for col in df.columns:
        print(f"  {col}: {df[col].dtype}")

    print("\n=== 샘플 3행 ===")
    print(df.head(3))

    print("\n=== province 분포 (상위 10) ===")
    print(df["province"].value_counts().sort("count", descending=True).head(10))

    print("\n=== age 분포 ===")
    print(df["age"].describe())


if __name__ == "__main__":
    explore()
