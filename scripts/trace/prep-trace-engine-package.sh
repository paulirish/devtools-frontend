#!/usr/bin/env bash

set -euo pipefail

DIRNAME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
dtfe="$DIRNAME/../.."
cd $dtfe

# Build to its own out folder, so it can have consistent args
out_dir="./out/TraceEngine"
dist="$out_dir/dist"  # This doesn't match up with typical obj,gen,resources layout but that's fine!

# build devtools first!
gn --args="is_debug=true" gen -C $out_dir
autoninja -C $out_dir front_end

rm -rf "$dist"
mkdir -p "$dist/core"
mkdir -p "$dist/models"
mkdir -p "$dist/generated"

cp -r "$out_dir/gen/front_end/models/trace" "$dist/models/trace"
cp -r "$out_dir/gen/front_end/models/cpu_profile" "$dist/models/cpu_profile"
cp -r "$out_dir/gen/front_end/core/platform" "$dist/core/platform"
cp "$out_dir/gen/front_end/generated/protocol.js" "$dist/generated/protocol.js"
cp "$out_dir/gen/front_end/generated/protocol.d.ts" "$dist/generated/protocol.d.ts"
cp ./front_end/models/trace/package-template.json "$dist/package.json"

echo 'export {};' > $dist/models/trace/extras/extras.js
echo 'export {};' > $dist/models/trace/extras/extras.d.ts
echo 'export {};' > $dist/models/trace/TracingManager.js
echo 'export {};' > $dist/models/trace/TracingManager.d.ts
echo 'export {};' > $dist/models/trace/LegacyTracingModel.js
echo 'export {};' > $dist/models/trace/LegacyTracingModel.d.ts


$DIRNAME/copy-build-trace-engine-for-publish.sh
