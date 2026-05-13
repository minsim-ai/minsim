"""Nemotron-Personas-Korea 다운로드 스크립트"""
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
PARQUET_PATH = DATA_DIR / "nemotron_korea_personas.parquet"


def download():
    from datasets import load_dataset

    if PARQUET_PATH.exists():
        print(f"이미 존재: {PARQUET_PATH} ({PARQUET_PATH.stat().st_size / 1e9:.2f} GB)")
        return

    print("다운로드 중... (약 1.98 GB, 시간이 걸립니다)")
    dataset = load_dataset("nvidia/Nemotron-Personas-Korea", split="train")
    print(f"행 수: {len(dataset):,}")
    print(f"컬럼: {dataset.column_names}")

    DATA_DIR.mkdir(exist_ok=True)
    dataset.to_parquet(str(PARQUET_PATH))
    print(f"저장 완료: {PARQUET_PATH} ({PARQUET_PATH.stat().st_size / 1e9:.2f} GB)")


if __name__ == "__main__":
    download()
