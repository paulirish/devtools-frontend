#!/usr/bin/env bash

set -euo pipefail

dtfe="./$(git rev-parse --show-cdup)"
standalone="$HOME/code/trace_engine"

trace_engine_dist="$dtfe/out/TraceEngine/dist"

# don't keep around old stuff
command rm -rf "$standalone/models" "$standalone/core" "$standalone/generated"

# copy files over
cp -rp "$trace_engine_dist/" "$standalone/"
cp -rp "$dtfe/front_end/models/trace/README.md" "$standalone"
cp -rp "$dtfe/front_end/models/trace/package-template.json" "$standalone/package.json"
cp -rp "$dtfe/LICENSE" "$standalone"
mkdir -p "$standalone/test"
cp -rp "$dtfe/front_end/panels/timeline/fixtures/traces/invalid-animation-events.json.gz" "$standalone/test"

# tweak paths for the new location
cp -rp "$dtfe/scripts/trace/analyze-trace.mjs" "$standalone/analyze-trace.mjs.orig"
cat "$standalone/analyze-trace.mjs.orig"        | \
  sed 's|../../out/TraceEngine/dist/|./|'     | \
  sed 's|front_end/panels/timeline/fixtures/traces/|test/|'  > "$standalone/analyze-trace.mjs"
cp -rp "$dtfe/scripts/trace/test/test-trace-engine.mjs" "$standalone/test/test-trace-engine.mjs.orig"
cat "$standalone/test/test-trace-engine.mjs.orig"  | \
  sed 's|front_end/panels/timeline/fixtures/traces/|test/|'  > "$standalone/test/test-trace-engine.mjs"

# cleanup
command rm "$standalone/analyze-trace.mjs.orig"
command rm "$standalone/test/test-trace-engine.mjs.orig"

echo "➕ Files copied. Testing…"
npm -C "$standalone" run test
exit $?
