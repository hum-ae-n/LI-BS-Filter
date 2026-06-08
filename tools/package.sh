#!/usr/bin/env bash
#
# Package LinkedOut into a Chrome Web Store-ready zip.
#
# Runs the security/compliance audit first as a gate, then bundles ONLY the
# files the extension needs at runtime (no .git, no tools/, no docs) into
# dist/linkedout-v<version>.zip. The build is deterministic (fixed file list,
# sorted, fixed timestamps) so repeated runs produce an identical archive.
#
# Usage:  bash tools/package.sh
set -eu

cd "$(dirname "$0")/.."

echo "== Gate: security/compliance audit =="
bash tools/audit.sh
echo

# Files shipped inside the extension package.
FILES=(
  manifest.json
  background.js
  content.js
  popup.html
  popup.js
  popup.css
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
  LICENSE
)

# Fail early if anything is missing.
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/linkedout-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"

python3 - "$OUT" "${FILES[@]}" <<'PY'
import sys, zipfile
out, files = sys.argv[1], sys.argv[2:]
# Fixed timestamp -> reproducible archive regardless of mtimes.
ts = (1980, 1, 1, 0, 0, 0)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(files):
        with open(name, "rb") as fh:
            data = fh.read()
        zi = zipfile.ZipInfo(name, date_time=ts)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = 0o644 << 16
        z.writestr(zi, data)
print("wrote", out)
PY

echo
echo "Package contents:"
unzip -l "$OUT" 2>/dev/null || python3 -c "import zipfile,sys;[print(' ',n) for n in zipfile.ZipFile('$OUT').namelist()]"
echo
echo "Ready to upload: $OUT"
