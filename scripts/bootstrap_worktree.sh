#!/usr/bin/env bash
# 새 git worktree를 독립 실행 가능한 상태로 만든다.
#
# git worktree는 추적 파일만 materialize한다. .gitignore가 data/*.parquet,
# data/personas/, .env를 무시하므로 새 워크트리는 데이터·시크릿·의존성이 비어 있다.
# 특히 복사한 .env는 SQLITE_PATH/RUNTIME_DATA_DIR가 프로덕션 절대경로를 가리키므로
# 반드시 덮어써야 한다. 그대로 두면 프로덕션 DB에 쓴다.
set -euo pipefail

SOURCE="${1:-}"
REDIS_DB="${2:-13}"
API_PORT="${3:-8010}"
W="$(git rev-parse --show-toplevel)"

if [[ -z "$SOURCE" || ! -d "$SOURCE/data" ]]; then
  echo "usage: $0 <source-worktree-path> [redis-db] [api-port]" >&2
  echo "  예: $0 ../koresim-v2 13 8010" >&2
  exit 1
fi
SOURCE="$(cd "$SOURCE" && pwd)"

echo "==> parquet 심볼릭 링크 (복사 아님: nationwide는 약 2GB)"
mkdir -p "$W/data"
for f in dgist_personas.parquet nemotron_korea_personas.parquet; do
  if [[ -e "$SOURCE/data/$f" ]]; then
    ln -sfn "$SOURCE/data/$f" "$W/data/$f"
    echo "    $f"
  else
    echo "    (없음) $f" >&2
  fi
done
[[ -e "$SOURCE/data/personas" ]] && ln -sfn "$SOURCE/data/personas" "$W/data/personas"
mkdir -p "$W/data/runtime"

echo "==> .env 복사 + 프로덕션 격리 오버라이드"
if [[ ! -f "$W/.env" ]]; then
  cp "$SOURCE/.env" "$W/.env"
  chmod 600 "$W/.env"
fi
sed -i '' \
  -e "s|^REDIS_URL=.*|REDIS_URL=redis://localhost:6379/${REDIS_DB}|" \
  -e "s|^RUNTIME_DATA_DIR=.*|RUNTIME_DATA_DIR=$W/data/runtime|" \
  -e "s|^SQLITE_PATH=.*|SQLITE_PATH=$W/data/runtime/koresim.sqlite3|" \
  -e "s|^PARQUET_PATH=.*|PARQUET_PATH=$W/data/nemotron_korea_personas.parquet|" \
  -e "s|^KORESIM_AUTH_BASE_URL=.*|KORESIM_AUTH_BASE_URL=http://127.0.0.1:${API_PORT}|" \
  -e "s|^KORESIM_AUTH_COOKIE_SECURE=.*|KORESIM_AUTH_COOKIE_SECURE=false|" \
  -e "s|^KORESIM_AUTH_TEST_LOGIN_ENABLED=.*|KORESIM_AUTH_TEST_LOGIN_ENABLED=true|" \
  "$W/.env"

echo "==> 의존성 (dev extra 포함 — 빠뜨리면 ruff/pytest가 없다)"
uv sync --extra dev
npm --prefix "$W/frontend" install

echo
echo "완료. 서버: uv run uvicorn src.api.main:app --host 127.0.0.1 --port ${API_PORT}"
echo "격리: Redis db${REDIS_DB} · SQLite $W/data/runtime/koresim.sqlite3"
