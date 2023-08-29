#!/usr/bin/env bash

set -euxo pipefail

# Usage:
#   watchexec "front_end/models/trace/build-trace-engine-lib.sh && node analyze-trace.mjs"


#########
# TODO: #
# - create declaration file i guess? https://esbuild.github.io/content-types/#no-type-system
# - exclude Common namespace.


dtfe=$(realpath "$HOME/chromium-devtools/devtools-frontend")
trace_engine_out="$dtfe/out/Default/gen/trace_engine"

$dtfe/third_party/esbuild/esbuild \
      --outdir=$trace_engine_out \
      --out-extension:.js=.mjs \
      --log-level=info \
      --sourcemap  \
      --bundle --tree-shaking=true \
      --format=esm \
      --metafile=$trace_engine_out/meta.json \
      --external:"*TracingManager.js" --external:"*extras.js" \
      $dtfe/front_end/models/trace/trace.ts

# Stub out some dependencies that need to be present but can be empty
touch $trace_engine_out/TracingManager.js

mkdir -p $trace_engine_out/extras/
touch $trace_engine_out/extras/extras.js
