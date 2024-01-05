#!/usr/bin/env bash

set -euo pipefail

#########
# TODO: #
# - create declaration file i guess? https://esbuild.github.io/content-types/#no-type-system


# Sorry. Paul-specific path!
dtfe=$(realpath "$HOME/chromium-devtools/devtools-frontend")
trace_engine_out="$dtfe/out/Default/gen/trace_engine"

# set a source-root below to avoid lots of ../ in the sourcemapped paths

$dtfe/third_party/esbuild/esbuild \
      --outdir=$trace_engine_out \
      --out-extension:.js=.mjs \
      --log-level=info \
      --sourcemap  \
      --source-root="@trace_engine/x/x/x/x/" \
      --bundle --tree-shaking=true \
      --format=esm \
      --metafile=$trace_engine_out/meta.json \
      --external:"*TracingManager.js" --external:"*extras.js" \
      $dtfe/front_end/models/trace/trace.ts

# Stub out some dependencies that need to be present but can be empty
touch $trace_engine_out/TracingManager.js

mkdir -p $trace_engine_out/extras/
touch $trace_engine_out/extras/extras.js
