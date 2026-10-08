#!/usr/bin/env bash

set -euo pipefail

DIRNAME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
dtfe="$DIRNAME/../.."
cd $dtfe

# Build to its own out folder, so it can have consistent args
out_dir="./out/TraceEngine"
dist="$out_dir/dist"  # This doesn't match up with typical obj,gen,resources layout but that's fine!

# Prevent old files from being copied to the dist folder. Yes, this forces a rebuild every time. Got a better idea?
rm -rf "$out_dir/gen"

# export all const enums so they can be used by clients. (perl instead of sed because bsd/gnu sed differ on -i flag)
shopt -s globstar
perl -pi -e 's/export const enum/export enum/g' "$dtfe"/front_end/models/trace/**/*.ts

# build devtools first!
gn --args="is_debug=true devtools_bundle=false" gen -C $out_dir
autoninja -C $out_dir front_end

rm -rf "$dist"
mkdir -p "$dist/core/common" "$dist/core/i18n" "$dist/core/sdk" "$dist/core/host" "$dist/core/root"
mkdir -p "$dist/models/crux-manager"
mkdir -p "$dist/generated"
mkdir -p "$dist/third_party/third-party-web" "$dist/third_party/marked"

cp -r "$out_dir/gen/front_end/models/trace" "$dist/models/trace"
cp -r "$out_dir/gen/front_end/models/cpu_profile" "$dist/models/cpu_profile"
cp -r "$out_dir/gen/front_end/core/platform" "$dist/core/platform"
cp -r "$out_dir/gen/front_end/third_party/legacy-javascript" "$dist/third_party/legacy-javascript"
cp "$out_dir/gen/front_end/generated/protocol.js" "$dist/generated/protocol.js"
cp "$out_dir/gen/front_end/generated/protocol.d.ts" "$dist/generated/protocol.d.ts"
cp ./front_end/models/trace/package-template.json "$dist/package.json"

# Replace HostRuntime.js (which uses top-level await on main) and UIString.d.ts (for LH IcuMessage types).
rm -rf "$dist/core/platform/browser" "$dist/core/platform/node"
cp "$DIRNAME/replacements/HostRuntime.js" "$dist/core/platform/HostRuntime.js"
cp "$DIRNAME/replacements/UIString.d.ts" "$dist/core/platform/UIString.d.ts"

# Copy ParsedURL from core/common and provide common.{js,d.ts}.
cp "$out_dir/gen/front_end/core/common/ParsedURL.js" "$dist/core/common/ParsedURL.js"
cp "$out_dir/gen/front_end/core/common/ParsedURL.js.map" "$dist/core/common/ParsedURL.js.map"
cp "$out_dir/gen/front_end/core/common/ParsedURL.d.ts" "$dist/core/common/ParsedURL.d.ts"
cp "$DIRNAME/replacements/common.js" "$dist/core/common/common.js"
cp "$DIRNAME/replacements/common.d.ts" "$dist/core/common/common.d.ts"

# Provide i18n shim returning deferred {i18nId, values} objects for Lighthouse localization.
cp "$DIRNAME/replacements/i18n.js" "$dist/core/i18n/i18n.js"
cp "$DIRNAME/replacements/i18n.d.ts" "$dist/core/i18n/i18n.d.ts"

# Provide type stubs for SDK and CrUXManager.
echo 'export {};' > "$dist/core/sdk/sdk.js"
cp "$DIRNAME/replacements/sdk.d.ts" "$dist/core/sdk/sdk.d.ts"
echo 'export {};' > "$dist/models/crux-manager/crux-manager.js"
cp "$DIRNAME/replacements/crux-manager.d.ts" "$dist/models/crux-manager/crux-manager.d.ts"

echo "import ThirdPartyWeb from 'third-party-web'; export {ThirdPartyWeb};" > "$dist/third_party/third-party-web/third-party-web.js"
cp "$dist/third_party/third-party-web/third-party-web.js" "$dist/third_party/third-party-web/third-party-web.d.ts"

echo 'export const userMetrics = new Proxy({}, {get: () => () => {}});' > "$dist/core/host/host.js"
echo 'export declare const userMetrics: any;' > "$dist/core/host/host.d.ts"
echo 'export {};' > "$dist/core/root/root.js"
echo 'export {};' > "$dist/core/root/root.d.ts"
echo 'export {};' > "$dist/third_party/marked/marked.js"
echo 'export {};' > "$dist/third_party/marked/marked.d.ts"

# Copy i18n strings.
# Also copies generated/Deprecation.ts strings, since Lighthouse benefits from that too.
python3 -c "
from pathlib import Path
import json

locales_out_path = Path('$dist/locales')
locales_out_path.mkdir(parents=True, exist_ok=True)

for path in Path('$out_dir/gen/front_end/core/i18n/locales').glob('*.json'):
    strings = json.loads(path.read_text())
    keys = [
        key for key in strings.keys()
        if key.startswith('models/trace/insights/') or key.startswith('panels/application/components/BackForwardCacheStrings.ts') or key.startswith('generated/Deprecation.ts')
    ]
    strings = {key: strings[key] for key in keys}
    (locales_out_path / path.name).write_text(json.dumps(strings, indent=2))
"

$DIRNAME/copy-build-trace-engine-for-publish.sh
