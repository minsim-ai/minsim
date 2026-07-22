"""Convert the DGIST persona JSON dataset into a Nemotron-compatible parquet.

Usage:
    uv run python scripts/import_dgist_personas.py --source /path/to/dgist.json
    uv run python scripts/import_dgist_personas.py \
        --source https://raw.githubusercontent.com/Jaeyeong-CHOI/dgist-personas/main/personas.json

Validates every record against the fields the prompt builder consumes, casts
dtypes to match the nationwide parquet, and writes DGIST_PARQUET_PATH so the
"dgist" persona pool becomes available.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DGIST_PARQUET_PATH  # noqa: E402

REQUIRED_DEMOGRAPHICS = (
    "uuid",
    "age",
    "sex",
    "province",
    "district",
    "occupation",
    "education_level",
    "marital_status",
    "family_type",
    "housing_type",
)
NARRATIVE_FIELDS = (
    "persona",
    "professional_persona",
    "family_persona",
    "culinary_persona",
    "cultural_background",
)


def _load_records(source: str) -> list[dict]:
    if source.startswith("http://") or source.startswith("https://"):
        import httpx

        response = httpx.get(source, timeout=60, follow_redirects=True)
        response.raise_for_status()
        if source.endswith(".jsonl"):
            payload = [
                json.loads(line) for line in response.text.splitlines() if line.strip()
            ]
        else:
            payload = response.json()
    elif source.endswith(".jsonl"):
        payload = [
            json.loads(line)
            for line in Path(source).read_text().splitlines()
            if line.strip()
        ]
    else:
        payload = json.loads(Path(source).read_text())
    if isinstance(payload, dict):
        for key in ("personas", "data", "records"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    if not isinstance(payload, list):
        raise SystemExit("지원하지 않는 JSON 구조입니다. 리스트(또는 personas/data 키)를 기대합니다.")
    return [record for record in payload if isinstance(record, dict)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="DGIST personas JSON path or URL")
    parser.add_argument("--out", default=str(DGIST_PARQUET_PATH), type=Path)
    parser.add_argument("--strict", action="store_true", help="누락 서사 필드도 오류로 처리")
    args = parser.parse_args()

    records = _load_records(args.source)
    if not records:
        raise SystemExit("변환할 레코드가 없습니다.")

    warnings = 0
    rows: list[dict] = []
    for index, record in enumerate(records):
        missing = [field for field in REQUIRED_DEMOGRAPHICS if not record.get(field)]
        if "uuid" in missing:
            record["uuid"] = f"dgist-{index:05d}"
            missing.remove("uuid")
        if missing:
            raise SystemExit(f"레코드 {index}: 필수 인구통계 필드 누락 {missing}")
        row = {field: record.get(field) for field in REQUIRED_DEMOGRAPHICS}
        try:
            row["age"] = int(record["age"])
        except (TypeError, ValueError):
            raise SystemExit(f"레코드 {index}: age가 정수가 아닙니다: {record.get('age')!r}") from None
        for field in NARRATIVE_FIELDS:
            value = record.get(field)
            if not isinstance(value, str) or not value.strip():
                if args.strict:
                    raise SystemExit(f"레코드 {index}: 서사 필드 누락 {field}")
                warnings += 1
                value = ""
            row[field] = value
        for field in REQUIRED_DEMOGRAPHICS:
            if field != "age":
                row[field] = str(row[field])
        rows.append(row)

    frame = pl.DataFrame(rows).with_columns(pl.col("age").cast(pl.Int64))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    frame.write_parquet(args.out)

    print(
        json.dumps(
            {
                "rows": frame.height,
                "narrative_warnings": warnings,
                "out_path": str(args.out),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
