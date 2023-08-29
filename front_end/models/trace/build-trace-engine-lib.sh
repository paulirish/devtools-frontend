#!/usr/bin/env bash

set -euxo pipefail

# usage:
#   watchexec "front_end/models/trace/build-trace-engine-lib.sh && node analyze-trace.mjs"

dtfe="/Users/paulirish/chromium-devtools/devtools-frontend"

$dtfe/third_party/esbuild/esbuild \
      --outdir=$dtfe/out/Default/gen/cooltrace \
      --out-extension:.js=.mjs \
      --log-level=info \
      --sourcemap  \
      --bundle --tree-shaking=true \
      --format=esm \
      --metafile=$dtfe/out/Default/gen/cooltrace/meta.json \
      --external:"*TracingManager.js" --external:"*extras.js" \
      $dtfe/front_end/models/trace/trace.ts


touch $dtfe/out/Default/gen/cooltrace/TracingManager.js
mkdir -p $dtfe/out/Default/gen/cooltrace/extras/
touch $dtfe/out/Default/gen/cooltrace/extras/extras.js
