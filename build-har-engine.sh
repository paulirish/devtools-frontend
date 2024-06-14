./third_party/esbuild/esbuild \
    --outdir="./out/delme" \
    --out-extension:.js=.mjs \
    --log-level=info \
    --sourcemap  \
    --source-root="@har_engine/x/x/x/x/" \
    --bundle --tree-shaking=true \
    --format=esm \
    --metafile=./out/delme/meta.json \
    --external:"*extras.js" \
    ./front_end/models/har/har.ts

node out/delme/har.mjs && \
node use-har-engine.mjs



