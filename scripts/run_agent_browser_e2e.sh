#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${KORESIM_E2E_BASE_URL:-http://127.0.0.1:8000}"
SESSION="${KORESIM_E2E_SESSION:-koresim-e2e}"
RUN_ID="${KORESIM_E2E_RUN_ID:-}"
TEST_LOGIN_URL="${KORESIM_E2E_TEST_LOGIN_URL:-}"

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser is not installed. Run: npm install -g agent-browser && agent-browser install" >&2
  exit 127
fi

if [[ -z "$RUN_ID" ]]; then
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "KORESIM_E2E_RUN_ID is required when sqlite3 is unavailable." >&2
    exit 2
  fi
  RUN_ID="$(
    sqlite3 "$PROJECT_ROOT/data/runtime/koresim.sqlite3" \
      "select runs.run_id from runs join run_results on runs.run_id = run_results.run_id where runs.status = 'completed' order by runs.completed_at desc limit 1;"
  )"
fi

if [[ -z "$RUN_ID" ]]; then
  echo "No completed run found. Create a completed run or set KORESIM_E2E_RUN_ID." >&2
  exit 2
fi

ab() {
  agent-browser --session "$SESSION" "$@"
}

echo "agent-browser session: $SESSION"
echo "base url: $BASE_URL"
echo "run id: $RUN_ID"

ab close >/dev/null 2>&1 || true

if [[ -n "$TEST_LOGIN_URL" ]]; then
  echo "auth: using test login endpoint $TEST_LOGIN_URL"
  ab open "$TEST_LOGIN_URL" >/dev/null
  ab wait 500 >/dev/null
else
  echo "auth: app-level auth is not enabled; running post-login UX path in an isolated browser session"
fi

ab set viewport 1280 900 >/dev/null
ab open "$BASE_URL/results?run_id=$RUN_ID" >/dev/null
ab wait 1000 >/dev/null

cat <<EOF | ab eval --stdin >/dev/null
localStorage.setItem('koresim:lastRunId', '$RUN_ID');
'ok';
EOF

echo "desktop results snapshot"
ab snapshot -i -c -d 3

cat <<'EOF' | ab eval --stdin >/dev/null
const label = '새 시뮬레이션';
const button = Array.from(document.querySelectorAll('button'))
  .find((item) => item.textContent && item.textContent.includes(label));
if (!button) throw new Error(`Button not found: ${label}`);
button.click();
'clicked';
EOF

ab wait 1500 >/dev/null
CURRENT_URL="$(ab get url | tail -n 1)"
if [[ "$CURRENT_URL" != "$BASE_URL/app" ]]; then
  echo "Expected 새 시뮬레이션 to land on $BASE_URL/app, got $CURRENT_URL" >&2
  exit 1
fi

cat <<'EOF' | ab eval --stdin
const bodyText = document.body.innerText;
const hasInput = Boolean(document.querySelector('textarea, input'));
const badToken = /(undefined|NaN|\[object Object\])/i.test(bodyText);
const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
if (!hasInput) throw new Error('Expected fresh simulation page to expose an input control.');
if (badToken) throw new Error('Fresh simulation page contains an obvious broken data token.');
if (overflow) throw new Error('Fresh simulation page has horizontal overflow.');
({ route: location.pathname, hasInput, badToken, overflow });
EOF

echo "mobile result visual smoke"
ab set viewport 390 844 >/dev/null
ab open "$BASE_URL/results?run_id=$RUN_ID" >/dev/null
ab wait 1000 >/dev/null

cat <<'EOF' | ab eval --stdin
const bodyText = document.body.innerText;
const badToken = /(undefined|NaN|\[object Object\])/i.test(bodyText);
const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
const crowd = bodyText.includes('군중감');
if (badToken) throw new Error('Mobile result page contains an obvious broken data token.');
if (overflow) throw new Error('Mobile result page has horizontal overflow.');
if (!crowd) throw new Error('Mobile result page did not render the crowd visualization section.');
({ route: location.pathname, badToken, overflow, crowd });
EOF

echo "agent-browser e2e passed"
