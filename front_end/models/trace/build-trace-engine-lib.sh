
~/chromium-devtools/devtools-frontend/third_party/esbuild/esbuild \
      --outdir=/Users/paulirish/chromium-devtools/devtools-frontend/out/Default/gen/cooltrace \
      --log-level=info \
      --sourcemap  \
      --bundle --tree-shaking=true \
      --metafile=/Users/paulirish/chromium-devtools/devtools-frontend/out/Default/gen/cooltrace/meta.json \
      --external:"*TracingManager.js" --external:"*extras.js" \
      ~/chromium-devtools/devtools-frontend/front_end/models/trace/trace.ts
