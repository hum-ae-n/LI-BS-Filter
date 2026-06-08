#!/usr/bin/env bash
#
# Security & compliance audit for LinkedIn Feed Filter.
# Codifies the PRD §8.2 Security Review Workflow automated checks so the
# review step is reproducible in one command. Exits non-zero on any finding.
#
# Usage:  bash tools/audit.sh
set -u

cd "$(dirname "$0")/.." || exit 2

JS_FILES="content.js background.js popup.js"
fail=0

check_absent() {
  # $1 = human label, $2 = extended regex
  local label="$1" pattern="$2"
  if grep -rnE "$pattern" $JS_FILES >/dev/null 2>&1; then
    echo "FAIL  $label"
    grep -rnE "$pattern" $JS_FILES | sed 's/^/        /'
    fail=1
  else
    echo "PASS  $label"
  fi
}

echo "== Prohibited code patterns (PRD §7.3) =="
check_absent "no eval / new Function"                 "eval|new[[:space:]]+Function"
check_absent "no innerHTML / outerHTML / document.write" "\.(inner|outer)HTML|document\.write\("
check_absent "no dynamic script creation"             "createElement\(['\"]script"
check_absent "no network APIs"                         "fetch|XMLHttpRequest|WebSocket|sendBeacon"
check_absent "no privileged chrome APIs"               "chrome\.(tabs|cookies|webRequest|webNavigation)"

echo
echo "== Manifest permissions & CSP (PRD §7.1 / §7.2) =="
python3 - <<'PY'
import json, sys
m = json.load(open("manifest.json"))
ok = True
def expect(cond, msg):
    global ok
    print(("PASS  " if cond else "FAIL  ") + msg)
    ok = ok and cond
expect(m.get("manifest_version") == 3, "manifest_version is 3")
expect(m.get("permissions") == ["storage"], "permissions == ['storage']")
expect(m.get("host_permissions") == ["https://www.linkedin.com/*"],
       "host_permissions == ['https://www.linkedin.com/*']")
expect(m.get("content_security_policy", {}).get("extension_pages")
       == "script-src 'self'; object-src 'none';", "CSP matches §7.2")
forbidden = {"tabs","webRequest","webNavigation","activeTab","clipboardRead",
             "identity","cookies"}
expect(not (set(m.get("permissions", [])) & forbidden),
       "no forbidden permissions requested")
sys.exit(0 if ok else 1)
PY
[ $? -ne 0 ] && fail=1

echo
echo "== JS syntax =="
for f in $JS_FILES; do
  if node --check "$f" >/dev/null 2>&1; then echo "PASS  $f parses"; else echo "FAIL  $f parse error"; fail=1; fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "AUDIT PASSED"
else
  echo "AUDIT FAILED"
fi
exit $fail
