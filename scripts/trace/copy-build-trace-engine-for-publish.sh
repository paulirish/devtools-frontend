#!/usr/bin/env bash

set -euo pipefail

dtfe="./$(git rev-parse --show-cdup)"
standalone="$HOME/code/trace_engine"

trace_engine_dist="$dtfe/out/TraceEngine/dist"

# We can't test before rolling anymore because of the third-party-web resolution stuff. No biggie.

echo -e "\nCopying to $standalone … \n"
mkdir -p "$standalone"

# don't keep around old stuff
command rm -rf "$standalone/models" "$standalone/core" "$standalone/generated"

# copy files over
cp -rp "$trace_engine_dist/" "$standalone/"
cp -rp "$dtfe/front_end/models/trace/README.md" "$standalone"
cp -rp "$dtfe/front_end/models/trace/package-template.json" "$standalone/package.json"
cp -rp "$dtfe/front_end/models/trace/tsconfig-template.json" "$standalone/tsconfig.json"
cp -rp "$dtfe/LICENSE" "$standalone"
mkdir -p "$standalone/test"
cp -rp "$dtfe/front_end/panels/timeline/fixtures/traces/invalid-animation-events.json.gz" "$standalone/test"

# tweak paths for the new location
cp -rp "$dtfe/front_end/analyze-trace.mjs" "$standalone/analyze-trace.mjs.orig"
cat "$standalone/analyze-trace.mjs.orig" | sed 's|../out/TraceEngine/dist/|./|' > "$standalone/analyze-trace.mjs"

cp -rp "$dtfe/front_end/analyze-inspector-issues.mjs" "$standalone/analyze-inspector-issues.mjs.orig"
cat "$standalone/analyze-inspector-issues.mjs.orig" | sed 's|../out/TraceEngine/dist/|./|' > "$standalone/analyze-inspector-issues.mjs"

cp -rp "$dtfe/scripts/trace/test/test-trace-engine.mjs" "$standalone/test/test-trace-engine.mjs"

# cleanup
command rm "$standalone/analyze-trace.mjs.orig"
command rm "$standalone/analyze-inspector-issues.mjs.orig"

echo "➕ Files copied. Testing…"
npm -C "$standalone" install
npm -C "$standalone" run test
exit $?
