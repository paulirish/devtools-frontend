#!/usr/bin/env bash

# Note: build devtools first!

set -euo pipefail

DIRNAME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
dtfe="$DIRNAME/../.."
cd $dtfe

config_dir="./out/Default"
trace_engine_out="$config_dir/gen/trace_engine"
rm -rf "$trace_engine_out"

mkdir -p "$trace_engine_out/core"
mkdir -p "$trace_engine_out/models"

cp -r "$config_dir/gen/front_end/models/trace" "$trace_engine_out/models/trace"
cp -r "$config_dir/gen/front_end/models/cpu_profile" "$trace_engine_out/models/cpu_profile"
cp -r "$config_dir/gen/front_end/core/platform" "$trace_engine_out/core/platform"
cp ./front_end/models/trace/package-template.json "$trace_engine_out/package.json"

python3 - << EOF
from pathlib import Path
path = Path('$trace_engine_out/models/trace/trace.js')
code = path.read_text()
code = code.replace("import * as Extras from './extras/extras.js'", "const Extras = {}")
code = code.replace("import * as TracingManager from './TracingManager.js'", "const TracingManager = {}")
path.write_text(code)
EOF
