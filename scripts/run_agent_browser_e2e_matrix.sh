#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${KORESIM_E2E_BASE_URL:-http://127.0.0.1:8000}"
MAX_PARALLEL="${KORESIM_E2E_MAX_PARALLEL:-4}"
SESSION_PREFIX="${KORESIM_E2E_SESSION_PREFIX:-koresim-matrix}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${KORESIM_E2E_REPORT_DIR:-$PROJECT_ROOT/docs/verification/e2e/agent-browser-large-scale-$TIMESTAMP}"
LOG_DIR="$REPORT_DIR/logs"
DB_PATH="$PROJECT_ROOT/data/runtime/koresim.sqlite3"

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser is not installed. Run: npm install -g agent-browser && agent-browser install" >&2
  exit 127
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required to discover completed run ids." >&2
  exit 127
fi

mkdir -p "$LOG_DIR"

if [[ "${KORESIM_E2E_SKIP_BUILD:-0}" != "1" ]]; then
  npm --prefix "$PROJECT_ROOT/frontend" run build
fi

expected_title() {
  case "$1" in
    creative_testing) echo "크리에이티브 비교 결과" ;;
    price_optimization) echo "가격 최적화 결과" ;;
    product_launch) echo "신제품 반응 결과" ;;
    value_proposition) echo "가치 제안 결과" ;;
    market_segmentation) echo "시장 세분화 결과" ;;
    competitive_positioning) echo "경쟁 포지셔닝 결과" ;;
    brand_perception) echo "브랜드 인식 결과" ;;
    churn_prediction) echo "이탈 예측 결과" ;;
    campaign_strategy) echo "캠페인 전략 결과" ;;
    *) echo "$1 결과" ;;
  esac
}

ab() {
  local session="$1"
  shift
  local attempt
  local log_file
  local pid
  local started_at
  local status
  local timeout_seconds
  log_file="$(mktemp)"
  timeout_seconds="${KORESIM_E2E_AGENT_BROWSER_TIMEOUT:-20}"
  if [[ "${1:-}" == "close" ]]; then
    timeout_seconds="${KORESIM_E2E_AGENT_BROWSER_CLOSE_TIMEOUT:-5}"
  fi
  for attempt in 1 2 3; do
    status=0
    agent-browser --session "$session" "$@" 2>"$log_file" &
    pid="$!"
    started_at="$SECONDS"
    while kill -0 "$pid" >/dev/null 2>&1; do
      if (( SECONDS - started_at >= timeout_seconds )); then
        kill "$pid" >/dev/null 2>&1 || true
        sleep 0.2
        kill -9 "$pid" >/dev/null 2>&1 || true
        wait "$pid" >/dev/null 2>&1 || true
        status=124
        break
      fi
      sleep 0.2
    done
    if [[ "$status" -eq 0 ]]; then
      if wait "$pid"; then
        rm -f "$log_file"
        return 0
      fi
      status="$?"
    fi
    if [[ "$status" -eq 0 ]]; then
      rm -f "$log_file"
      return 0
    fi
    if [[ "$status" -eq 124 ]]; then
      echo "agent-browser timed out after ${timeout_seconds}s: --session $session $*" >"$log_file"
    fi
    if ! grep -qiE 'Resource temporarily unavailable|daemon may be busy|connection refused|timed out' "$log_file"; then
      cat "$log_file" >&2
      rm -f "$log_file"
      return 1
    fi
    sleep "$attempt"
  done
  cat "$log_file" >&2
  rm -f "$log_file"
  return 1
}

assert_common_page() {
  local session="$1"
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
const badToken = /(undefined|NaN|\[object Object\])/i.test(bodyText);
const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
if (badToken) throw new Error('Page contains an obvious broken data token.');
if (overflow) {
  throw new Error(`Page has horizontal overflow: scrollWidth=${document.documentElement.scrollWidth}, innerWidth=${window.innerWidth}`);
}
return { badToken, overflow, path: location.pathname };
})()
EOF
}

ensure_auth_session() {
  local session="$1"
  if [[ "${KORESIM_E2E_USE_TEST_LOGIN:-0}" != "1" ]]; then
    return 0
  fi
  ab "$session" open "$BASE_URL/api/auth/test-login?next=/" >/dev/null
  ab "$session" wait 300 >/dev/null
}

run_result_case() {
  local sim="$1"
  local run_id="$2"
  local viewport="$3"
  local width="$4"
  local height="$5"
  local session="$SESSION_PREFIX-result-$sim-$viewport"
  local title
  title="$(expected_title "$sim")"

  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport "$width" "$height" >/dev/null
  ensure_auth_session "$session"
  ab "$session" open "$BASE_URL/results?run_id=$run_id" >/dev/null
  ab "$session" wait 1000 >/dev/null

  cat <<EOF | ab "$session" eval --stdin
(() => {
const expectedTitle = '$title';
const bodyText = document.body.innerText;
const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((item) => item.textContent?.trim() ?? '');
const personaButtons = Array.from(document.querySelectorAll('button')).filter((item) => /^\\d+$/.test(item.textContent?.trim() ?? '')).length;
const required = ['응답 수', '파싱 성공률', '표본 등급', '종합 등급', '군중감'];
if (!bodyText.includes(expectedTitle)) throw new Error(`Missing result title: ${expectedTitle}`);
for (const label of required) {
  if (!bodyText.includes(label)) throw new Error(`Missing required result label: ${label}`);
}
if (personaButtons < 1) throw new Error('Expected at least one persona crowd button.');
const badToken = /(undefined|NaN|\\[object Object\\])/i.test(bodyText);
const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
if (badToken) throw new Error('Result page contains an obvious broken data token.');
if (overflow) throw new Error(`Result page has horizontal overflow: scrollWidth=${document.documentElement.scrollWidth}, innerWidth=${window.innerWidth}`);
return { kind: 'result', simulation: '$sim', viewport: '$viewport', runId: '$run_id', headings, personaButtons, badToken, overflow };
})()
EOF

  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const firstPersona = Array.from(document.querySelectorAll('button')).find((item) => /^\d+$/.test(item.textContent?.trim() ?? ''));
if (!firstPersona) throw new Error('No persona button to open.');
firstPersona.click();
return 'opened';
})()
EOF
  ab "$session" wait 300 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const dialog = document.querySelector('[role="dialog"]');
if (!dialog) throw new Error('Persona modal did not open.');
const text = dialog.textContent ?? '';
if (!text.includes('persona') || !text.includes('parsed')) throw new Error('Persona modal is missing detail fields.');
const closeButton = dialog.querySelector('button[aria-label="닫기"]');
if (!closeButton) throw new Error('Persona modal close button is missing.');
closeButton.click();
return { modalOpened: true };
})()
EOF
}

run_landing_case() {
  local viewport="$1"
  local width="$2"
  local height="$3"
  local session="$SESSION_PREFIX-landing-$viewport"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport "$width" "$height" >/dev/null
  ab "$session" open "$BASE_URL/" >/dev/null
  ab "$session" wait 1000 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
if (!bodyText.includes('KoreaSim')) throw new Error('Landing page does not show KoreaSim.');
if (!bodyText.includes('시뮬레이션')) throw new Error('Landing page does not describe simulation.');
return { route: location.pathname, title: document.title };
})()
EOF
  assert_common_page "$session"
}

run_app_case() {
  local viewport="$1"
  local width="$2"
  local height="$3"
  local session="$SESSION_PREFIX-app-$viewport"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport "$width" "$height" >/dev/null
  ensure_auth_session "$session"
  ab "$session" open "$BASE_URL/app" >/dev/null
  ab "$session" wait 1000 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const moreButton = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('더보기'));
if (moreButton) moreButton.click();
return { clickedMore: Boolean(moreButton) };
})()
EOF
  ab "$session" wait 400 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
const simButtons = document.querySelectorAll('.ks-sim-btn').length;
const presetCards = document.querySelectorAll('.ks-preset-card').length;
if (!bodyText.includes('무엇을 시뮬레이션할까요?')) throw new Error('App page is missing the simulation picker prompt.');
if (!bodyText.includes('30초 안에 데모 실행')) throw new Error('App page is missing quick-start presets.');
if (simButtons !== 9) throw new Error(`Expected 9 simulation buttons after expanding picker, got ${simButtons}.`);
if (presetCards < 9) throw new Error(`Expected at least 9 preset cards, got ${presetCards}.`);
if (!document.querySelector('textarea, input')) throw new Error('App page is missing a chat input.');
return { route: location.pathname, simButtons, presetCards };
})()
EOF
  assert_common_page "$session"
}

run_validation_case() {
  local viewport="$1"
  local width="$2"
  local height="$3"
  local session="$SESSION_PREFIX-validation-$viewport"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport "$width" "$height" >/dev/null
  ab "$session" open "$BASE_URL/validation" >/dev/null
  ab "$session" wait 1000 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
for (const text of ['검증 가능한 한국 페르소나 시뮬레이션', '9/9', '1,800', 'PASS', '해석 원칙']) {
  if (!bodyText.includes(text)) throw new Error(`Validation page missing: ${text}`);
}
return { route: location.pathname };
})()
EOF
  assert_common_page "$session"
}

run_state_case() {
  local story="$1"
  local expected="$2"
  local session="$SESSION_PREFIX-state-$story"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport 1280 900 >/dev/null
  ensure_auth_session "$session"
  ab "$session" open "$BASE_URL/results/story/$story" >/dev/null
  ab "$session" wait 800 >/dev/null
  cat <<EOF | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
if (!bodyText.includes('$expected')) throw new Error('State page missing expected text: $expected');
return { route: location.pathname, expected: '$expected' };
})()
EOF
  assert_common_page "$session"
}

run_api_json_case() {
  local name="$1"
  local path="$2"
  local expected="$3"
  local session="$SESSION_PREFIX-api-$name"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport 900 700 >/dev/null
  ab "$session" open "$BASE_URL$path" >/dev/null
  ab "$session" wait 500 >/dev/null
  cat <<EOF | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
if (!bodyText.includes('$expected')) throw new Error('API page missing expected token: $expected');
JSON.parse(bodyText);
return { path: location.pathname, expected: '$expected' };
})()
EOF
}

run_auth_session_case() {
  local session="$SESSION_PREFIX-auth-session"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport 900 700 >/dev/null
  ab "$session" open "$BASE_URL/api/auth/session" >/dev/null
  ab "$session" wait 500 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const bodyText = document.body.innerText;
const data = JSON.parse(bodyText);
if (typeof data.authenticated !== 'boolean') throw new Error('Auth session missing authenticated boolean.');
if (!data.login_url || !data.logout_url) throw new Error('Auth session missing login/logout URLs.');
return { authenticated: data.authenticated, authEnabled: data.auth_enabled };
})()
EOF
}

run_export_case() {
  local run_id="$1"
  local session="$SESSION_PREFIX-export"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport 900 700 >/dev/null
  ensure_auth_session "$session"
  ab "$session" open "$BASE_URL/api/runs/$run_id/export" >/dev/null
  ab "$session" wait 500 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
const data = JSON.parse(document.body.innerText);
if (data.schema_version !== 'koresim-export/v1') throw new Error('Unexpected export schema.');
if (data.raw_results_included !== false) throw new Error('Export should not include raw persona results.');
if (data.raw_results) throw new Error('Export leaked raw_results.');
if (data.human_review_required !== true) throw new Error('Export must require human review.');
return { schema: data.schema_version, humanReviewRequired: data.human_review_required };
})()
EOF
}

run_sse_case() {
  local run_id="$1"
  local session="$SESSION_PREFIX-sse"
  ab "$session" close >/dev/null 2>&1 || true
  ensure_auth_session "$session"
  ab "$session" open "$BASE_URL/results?run_id=$run_id" >/dev/null
  ab "$session" wait 500 >/dev/null
  cat <<EOF | ab "$session" eval --stdin
(async () => {
return await new Promise((resolve, reject) => {
  const events = [];
  const source = new EventSource('/api/runs/$run_id/events');
  const timer = setTimeout(() => {
    source.close();
    reject(new Error('Timed out waiting for SSE replay event.'));
  }, 5000);
  const done = (eventName) => {
    events.push(eventName);
    clearTimeout(timer);
    source.close();
    resolve(events);
  };
  source.addEventListener('snapshot', () => done('snapshot'));
  source.addEventListener('completed', () => done('completed'));
  source.addEventListener('progress', () => done('progress'));
  source.onerror = () => {
    clearTimeout(timer);
    source.close();
    reject(new Error('SSE replay errored.'));
  };
});
})()
EOF
}

run_new_simulation_regression_case() {
  local run_id="$1"
  local session="$SESSION_PREFIX-new-simulation"
  ab "$session" close >/dev/null 2>&1 || true
  ab "$session" set viewport 1280 900 >/dev/null
  ensure_auth_session "$session"
  ab "$session" open "$BASE_URL/results?run_id=$run_id" >/dev/null
  ab "$session" wait 800 >/dev/null
  cat <<EOF | ab "$session" eval --stdin >/dev/null
(() => {
localStorage.setItem('koresim:lastRunId', '$run_id');
const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('새 시뮬레이션'));
if (!button) throw new Error('새 시뮬레이션 button not found.');
button.click();
return 'clicked';
})()
EOF
  ab "$session" wait 1200 >/dev/null
  cat <<'EOF' | ab "$session" eval --stdin
(() => {
if (location.pathname !== '/app') throw new Error(`Expected /app after 새 시뮬레이션, got ${location.pathname}${location.search}`);
if (!document.querySelector('textarea, input')) throw new Error('Fresh simulation page is missing input.');
return { route: location.pathname, hasInput: true };
})()
EOF
}

RUN_ROWS=()
while IFS= read -r row; do
  [[ -n "$row" ]] && RUN_ROWS+=("$row")
done < <(
  sqlite3 -separator '|' "$DB_PATH" "
    with ranked as (
      select
        runs.simulation_type,
        runs.run_id,
        runs.completed_at,
        row_number() over (
          partition by runs.simulation_type
          order by runs.completed_at desc
        ) as rn
      from runs
      join run_results on runs.run_id = run_results.run_id
      where runs.status = 'completed'
    )
    select simulation_type, run_id from ranked where rn = 1 order by simulation_type;
  "
)

if [[ "${#RUN_ROWS[@]}" -lt 9 ]]; then
  echo "Expected completed results for 9 simulations, found ${#RUN_ROWS[@]}." >&2
  printf '%s\n' "${RUN_ROWS[@]}" >&2
  exit 2
fi

FIRST_RUN_ID="$(printf '%s\n' "${RUN_ROWS[@]}" | head -1 | cut -d'|' -f2)"

PIDS=()
CASES=()

throttle() {
  while [[ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$MAX_PARALLEL" ]]; do
    sleep 0.2
  done
}

start_case() {
  local name="$1"
  shift
  throttle
  (
    set -euo pipefail
    echo "case=$name"
    echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    "$@"
    echo "status=passed"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ) >"$LOG_DIR/$name.log" 2>&1 &
  PIDS+=("$!")
  CASES+=("$name")
}

for row in "${RUN_ROWS[@]}"; do
  sim="${row%%|*}"
  run_id="${row#*|}"
  start_case "result-${sim}-desktop" run_result_case "$sim" "$run_id" desktop 1280 900
  start_case "result-${sim}-mobile" run_result_case "$sim" "$run_id" mobile 390 844
done

start_case "landing-desktop" run_landing_case desktop 1280 900
start_case "landing-mobile" run_landing_case mobile 390 844
start_case "app-desktop" run_app_case desktop 1280 900
start_case "app-mobile" run_app_case mobile 390 844
start_case "validation-desktop" run_validation_case desktop 1280 900
start_case "validation-mobile" run_validation_case mobile 390 844
start_case "state-no-run" run_state_case no_run_selected "표시할 run이 없습니다"
start_case "state-failed" run_state_case run_failed "Run failed"
start_case "state-interrupted" run_state_case run_interrupted "Run interrupted"
start_case "api-config" run_api_json_case config /api/config "simulation_types"
start_case "api-health" run_api_json_case health /api/health "koresim-api"
start_case "api-auth-session" run_auth_session_case
start_case "api-export" run_export_case "$FIRST_RUN_ID"
start_case "sse-replay" run_sse_case "$FIRST_RUN_ID"
start_case "new-simulation-regression" run_new_simulation_regression_case "$FIRST_RUN_ID"

FAILURES=0
SUMMARY="$REPORT_DIR/summary.tsv"
{
  echo -e "case\tstatus\tlog"
  for index in "${!PIDS[@]}"; do
    pid="${PIDS[$index]}"
    name="${CASES[$index]}"
    if wait "$pid"; then
      echo -e "$name\tpassed\tlogs/$name.log"
    else
      echo -e "$name\tfailed\tlogs/$name.log"
      FAILURES=$((FAILURES + 1))
    fi
  done
} >"$SUMMARY"

cat >"$REPORT_DIR/report.md" <<EOF
---
title: Agent Browser Large-Scale E2E Report
type: verification-artifact
created: $(date -u +%Y-%m-%d)
status: $([[ "$FAILURES" -eq 0 ]] && echo passed || echo failed)
---

# Agent Browser Large-Scale E2E Report

- Base URL: \`$BASE_URL\`
- Max parallel sessions: \`$MAX_PARALLEL\`
- Completed simulation result pages: \`${#RUN_ROWS[@]}\`
- Total cases: \`${#PIDS[@]}\`
- Failures: \`$FAILURES\`
- Summary: \`summary.tsv\`
- Logs: \`logs/*.log\`

## Simulation Result Runs

\`\`\`text
$(printf '%s\n' "${RUN_ROWS[@]}")
\`\`\`

## Summary

\`\`\`text
$(cat "$SUMMARY")
\`\`\`
EOF

cat "$SUMMARY"
echo "report_dir=$REPORT_DIR"

if [[ "$FAILURES" -ne 0 ]]; then
  exit 1
fi
