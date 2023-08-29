#!/usr/bin/env bash

set -euxo pipefail

dtfe=$(realpath "$HOME/chromium-devtools/devtools-frontend")
trace_engine_out="$dtfe/out/Default/gen/trace_engine"

standalone="$HOME/code/trace_engine"


cp -rp "$trace_engine_out/" "$standalone/"

cp -rp "$dtfe/front_end/models/trace/README.md" "$standalone"
cp -rp "$dtfe/front_end/models/trace/package-template.json" "$standalone/package.json"


mkdir -p "$standalone/test"
cp -rp "$dtfe/test/unittests/fixtures/traces/invalid-animation-events.json.gz" "$standalone/test"

# tweak it for the new location
cp -rp "$dtfe/analyze-trace.mjs" "$standalone/analyze-trace.mjs.orig"
cat "$standalone/analyze-trace.mjs.orig"        | \
  sed 's|./out/Default/gen/trace_engine/|./|'     | \
  sed 's|test/unittests/fixtures/traces/|test/|'  > "$standalone/analyze-trace.mjs"

command rm "$standalone/analyze-trace.mjs.orig"
