#!/usr/bin/env bash

set -euxo pipefail

# usage:
#   watchexec "front_end/models/trace/build-trace-engine-lib.sh && node analyze-trace.mjs"

dtfe=$(realpath "$HOME/chromium-devtools/devtools-frontend")

$dtfe/third_party/esbuild/esbuild \
      --outdir=$dtfe/out/Default/gen/trace_engine \
      --out-extension:.js=.mjs \
      --log-level=info \
      --sourcemap  \
      --bundle --tree-shaking=true \
      --format=esm \
      --metafile=$dtfe/out/Default/gen/trace_engine/meta.json \
      --external:"*TracingManager.js" --external:"*extras.js" \
      $dtfe/front_end/models/trace/trace.ts

# stub out some dependencies that need to be present but can be empty
touch $dtfe/out/Default/gen/trace_engine/TracingManager.js

mkdir -p $dtfe/out/Default/gen/trace_engine/extras/
touch $dtfe/out/Default/gen/trace_engine/extras/extras.js
