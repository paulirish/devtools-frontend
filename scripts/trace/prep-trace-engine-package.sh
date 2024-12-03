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

# Strip out the i18n modules and some type-only stuff.
python3 -c "
from pathlib import Path

for p in Path('$dist/models/trace/insights').rglob('*.js'):
    content = p.read_text()

    needle = 'import * as i18n'
    content = content.replace(needle, f'// {needle}')

    needle = 'const str_ ='
    content = content.replace(needle, f'// {needle}')

    needle = 'const i18nString ='
    content = content.replace(needle, 'const i18nString = string => string; //')

    p.write_text(content)

for p in Path('$dist/models').rglob('*.d.ts'):
    content = p.read_text()

    needle = 'import type * as Common'
    content = content.replace(needle, f'// {needle}')

    needle = 'Common.UIString.LocalizedString'
    content = content.replace(needle, 'string')

    needle = 'import type * as SDK'
    content = content.replace(needle, f'// {needle}')

    needle = 'SDK.NetworkManager.Conditions'
    content = content.replace(needle, 'any')

    needle = 'import type * as CrUXManager'
    content = content.replace(needle, f'// {needle}')

    needle = 'CrUXManager.PageResult'
    content = content.replace(needle, 'any')

    p.write_text(content)
"

# Replacement extras provides URLForEntry and ThirdPartyWeb. Funnily the JS works for both js and d.ts
cp $DIRNAME/replacements/extras.js $dist/models/trace/extras/extras.js
cp $DIRNAME/replacements/extras.js $dist/models/trace/extras/extras.d.ts
mkdir -p $dist/third_party/third-party-web/
echo "import ThirdPartyWeb from 'third-party-web'; export {ThirdPartyWeb};" > $dist/third_party/third-party-web/third-party-web.js
cp $dist/third_party/third-party-web/third-party-web.js $dist/third_party/third-party-web/third-party-web.d.ts

echo 'export {};' > $dist/models/trace/TracingManager.js
echo 'export {};' > $dist/models/trace/TracingManager.d.ts
echo 'export {};' > $dist/models/trace/LegacyTracingModel.js
echo 'export {};' > $dist/models/trace/LegacyTracingModel.d.ts

# Copy i18n strings.
python3 -c "
from pathlib import Path
import json

locales_out_path = Path('$dist/locales')
locales_out_path.mkdir(parents=True, exist_ok=True)

for path in Path('$out_dir/gen/front_end/core/i18n/locales').glob('*.json'):
    strings = json.loads(path.read_text())
    keys = [key for key in strings.keys() if key.startswith('models/trace/insights/')]
    strings = {key: strings[key] for key in keys}
    (locales_out_path / path.name).write_text(json.dumps(strings, indent=2))
"

$DIRNAME/copy-build-trace-engine-for-publish.sh



## This esbuild command outputs a single file bundle (untyped!) of the library.
## It can be useful for checking bundle-size, dependencies added, or using the esbuild analyzer: https://esbuild.github.io/analyze/
# ./third_party/esbuild/esbuild \
#       --outdir=./out/trace_engine-esbuild --out-extension:.js=.mjs \
#       --bundle --tree-shaking=true --format=esm \
#       --sourcemap  --source-root="@trace_engine/x/x/x/x/" \
#       --metafile=./out/trace_engine-esbuild/meta.json \
#       --log-level=info \
#       --external:"*TracingManager.js" --external:"*extras.js" \
#       ./front_end/models/trace/trace.ts
