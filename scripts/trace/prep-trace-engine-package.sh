#!/usr/bin/env bash

set -euo pipefail

DIRNAME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
dtfe="$DIRNAME/../.."
cd $dtfe

# Build to its own out folder, so it can have consistent args
out_dir="./out/TraceEngine"
dist="$out_dir/dist"  # This doesn't match up with typical obj,gen,resources layout but that's fine!

# Prevent old files from being copied to the dist folder. Yes, this forces a rebuild every time. Got a better idea?
# rm -rf "$out_dir/gen"
# TODO ! restore above

sed -i 's/export const enum/export enum/g' "$dtfe"/front_end/models/trace/*

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

# Smuggling issues in this package...
# TODO: uncommented for now, since it's not done.
# cp -r "$out_dir/gen/front_end/models/issues_manager" "$dist/models/issues_manager"

# Strip out the i18n modules and some type-only stuff.
python3 -c "
from pathlib import Path

for p in Path('$dist').rglob('*.js'):
    content = p.read_text()

    needle = 'import * as i18n'
    content = content.replace(needle, f'// {needle}')

    needle = 'const str_ ='
    content = content.replace(needle, f'// {needle}')

    needle = 'Host.userMetrics.'
    content = content.replace(needle, f'// {needle}')

    needle = 'extends Common.ObjectWrapper.ObjectWrapper'
    content = content.replace(needle, 'extends class {}')

    needle = 'const i18nString ='
    content = content.replace(needle, 'const i18nString = (i18nId, values) => ({i18nId, values}); //')

    needle = 'const i18nLazyString ='
    content = content.replace(needle, 'const i18nLazyString = (i18nId, values) => ({i18nId, values}); //')

    needle = 'i18n.i18n.lockedLazyString'
    content = content.replace(needle, '')

    needle = 'i18n.ByteUtilities.bytesToString'
    content = content.replace(needle, '(bytes => ({__i18nBytes: bytes}))')

    needle = 'i18n.TimeUtilities.millisToString'
    content = content.replace(needle, '(bytes => ({__i18nMillis: bytes}))')

    p.write_text(content)

for p in Path('$dist').rglob('*.d.ts'):
    content = p.read_text()

    make_any = [
        'Common.Settings.Setting<boolean>',
        'Common.Settings.Setting<HideIssueMenuSetting>',
        'CrUXManager.PageResult',
        'CrUXManager.PageScope',
        'CrUXManager.Scope',
        'Marked.Marked.Token',
        'SDK.ConsoleModel.ConsoleMessage',
        'SDK.IssuesModel.IssuesModel',
        'SDK.NetworkManager.Conditions',
        'SDK.NetworkManager.Conditions',
        'SDK.ResourceTreeModel.ResourceTreeFrame',
        'SDK.Target.Target',

        # Order is important here.
        'SDK.SourceMap.SourceMapV3',
        'SDK.SourceMap.SourceMap',
    ]
    for needle in make_any:
        content = content.replace(needle, 'any')

    comment_out = [
        'import type * as Common',
        'import type * as CrUXManager',
        'import type * as SDK',
    ]
    for needle in comment_out:
        content = content.replace(needle, f'// {needle}')

    for needle in ['Common.UIString.LocalizedString', 'Platform.UIString.LocalizedString']:
        content = content.replace(needle, '{i18nId: string, values: Record<string, string|number>, formattedDefault: string}')

    needle = 'import(\"../../../core/i18n/i18nTypes.js\").Values'
    content = content.replace(needle, 'Record<string, string>')

    needle = 'import(\"../../../core/platform/UIString.js\").LocalizedString'
    content = content.replace(needle, 'Record<string, string>')

    needle = 'extends Common.ObjectWrapper.ObjectWrapper<EventTypes>'
    content = content.replace(needle, 'extends class {}')

    needle = 'implements SDK.TargetManager.SDKModelObserver<any>'
    content = content.replace(needle, '')

    needle = 'CSSInJS'
    content = content.replace(needle, 'string')

    p.write_text(content)
"

# Replacement extras provides URLForEntry and ThirdPartyWeb. Funnily the JS works for both js and d.ts
cp $DIRNAME/replacements/extras.js $dist/models/trace/extras/extras.js
cp $DIRNAME/replacements/extras.js $dist/models/trace/extras/extras.d.ts
mkdir -p $dist/third_party/third-party-web/
echo "import ThirdPartyWeb from 'third-party-web'; export {ThirdPartyWeb};" > $dist/third_party/third-party-web/third-party-web.js
cp $dist/third_party/third-party-web/third-party-web.js $dist/third_party/third-party-web/third-party-web.d.ts

mkdir -p $dist/third_party/legacy-javascript/
echo "import * as LegacyJavaScript from 'legacy-javascript'; export {LegacyJavaScript};" > $dist/third_party/legacy-javascript/legacy-javascript.js
cp $dist/third_party/legacy-javascript/legacy-javascript.js $dist/third_party/legacy-javascript/legacy-javascript.d.ts

echo 'export {};' > $dist/models/trace/TracingManager.js
echo 'export {};' > $dist/models/trace/TracingManager.d.ts
echo 'export {};' > $dist/models/trace/LegacyTracingModel.js
echo 'export {};' > $dist/models/trace/LegacyTracingModel.d.ts

# Issues stuff
mkdir -p $dist/models/issues_manager/
echo 'export {};' > $dist/models/issues_manager/CheckFormsIssuesTrigger.js
echo 'export {};' > $dist/models/issues_manager/CheckFormsIssuesTrigger.d.ts
echo 'export {};' > $dist/models/issues_manager/ContrastCheckTrigger.js
echo 'export {};' > $dist/models/issues_manager/ContrastCheckTrigger.d.ts
echo 'export {};' > $dist/models/issues_manager/IssueResolver.js
echo 'export {};' > $dist/models/issues_manager/IssueResolver.d.ts
echo 'export {};' > $dist/models/issues_manager/RelatedIssue.js
echo 'export {};' > $dist/models/issues_manager/RelatedIssue.d.ts
echo 'export const SourceFrameIssuesManager = null;' > $dist/models/issues_manager/SourceFrameIssuesManager.js
echo 'export {};' > $dist/models/issues_manager/SourceFrameIssuesManager.d.ts
# Lighthouse currently does deprecations separate from issues.
echo 'export const DeprecationIssue = {fromInspectorIssue: () => []};' > $dist/models/issues_manager/DeprecationIssue.js
echo 'export {};' > $dist/models/issues_manager/DeprecationIssue.d.ts

mkdir -p $dist/core/sdk/ $dist/core/host/ $dist/core/root/ $dist/core/common/ $dist/third_party/marked/
echo 'export {};' > $dist/core/sdk/sdk.js
echo 'export {};' > $dist/core/sdk/sdk.d.ts
echo 'export {};' > $dist/core/host/host.js
echo 'export {};' > $dist/core/host/host.d.ts
echo 'export {};' > $dist/core/common/common.js
echo 'export {};' > $dist/core/common/common.d.ts
echo 'export {};' > $dist/core/root/root.js
echo 'export {};' > $dist/core/root/root.d.ts
echo 'export {};' > $dist/third_party/marked/marked.js
echo 'export {};' > $dist/third_party/marked/marked.d.ts

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
