# `@paulirish/trace_engine` & DevTools Foundation TODOs

## 1. How `devtools-frontend` and `chrome-devtools-mcp` Work Today

1. **DevTools Foundation (`origin/main`)**:
   - Almost all of `front_end/core/*` (`common`, `host`, `i18n`, `platform`, `protocol_client`, `sdk`, `text_utils`) and `front_end/models/*` (`trace`, `issues_manager`, `cpu_profile`, `bindings`, `workspace`, `source_map_scopes`, `crux-manager`, `ai_assistance`, etc.) have been migrated to `devtools_foundation_module` in `scripts/build/ninja/devtools_module.gni`.
   - Foundation modules are typechecked against both Browser and Node.js APIs (`runs_in = "node"`) and tested directly in Node.js via Mocha (`run_devtools_node_unit_tests`) instead of Karma/Chrome (see `front_end/foundation/README.md`).
   - Top-level `mcp/mcp.ts` re-exports `TraceEngine` (`../front_end/models/trace/trace.js`), `IssuesManager`, `Common`, `SDK`, `Foundation`, `I18n`, `Platform`, `Protocol`, etc.

2. **How `chrome-devtools-mcp` Consumes `devtools-frontend`**:
   - DevTools does **not** publish a standalone compiled `mcp` or `foundation` npm package.
   - `chrome-devtools-mcp` consumes `devtools-frontend` via a sparse-checkout git submodule (`third_party/devtools-frontend`), compiles `mcp/mcp.ts` with `tsc`, runs `scripts/post-build.ts` to stub out 4 GN-generated modules (`core/i18n/locales.js`, `core/root/Runtime.js`, `codemirror.next`, `*.skill.js`), and bundles everything with Rollup into its own CLI.
   - Existing npm packages cannot be used directly by Lighthouse:
     - `chrome-devtools-mcp` bundles the MCP server + Puppeteer into a CLI and depends on `lighthouse` itself.
     - `chrome-devtools-frontend` only contains raw, uncompiled `.ts` source files without compiled `.js`/`.d.ts` or GN-generated files.

---

## 2. Why Lighthouse Has Extra Requirements Beyond `chrome-devtools-mcp`

1. **Browser / IIFE Bundling (`dt-bundle.js` & `lightrider`)**:
   - `chrome-devtools-mcp` only runs in Node.js (ESM), whereas Lighthouse bundles `core/` + `trace_engine` into an IIFE via `esbuild` (`build/build-bundle.js`) to run inside Chrome DevTools and Lightrider.
   - `front_end/core/platform/HostRuntime.ts` on `origin/main` uses top-level `await` (`export const HOST_RUNTIME = await (async () => { ... })()`), which breaks `esbuild --format=iife` unless replaced with a synchronous stub during packaging.
2. **Deferred `LH.IcuMessage` Localization**:
   - In DevTools and `chrome-devtools-mcp`, `i18nString(UIStrings.foo, {PH1: ...})` immediately returns an English `string`.
   - Lighthouse requires `i18nString(...)` in insights to return `{i18nId, values}` objects so `TraceEngineResult.localizeInsights()` can convert them into `LH.IcuMessage` objects for Lighthouse's 40+ locale files and LHR locale swapping.
3. **TypeScript `const enum`s at Runtime**:
   - `chrome-devtools-mcp` compiles its TypeScript alongside DevTools's `.ts` files so `tsc` inlines `const enum` values. Because Lighthouse is plain JS (with JSDoc types) consuming precompiled `.js`, `export const enum` in `front_end/models/trace` gets erased at runtime unless converted to `export enum`.

---

## 3. Action Plan to Simplify `@paulirish/trace_engine`

### A. Eliminate `front_end/` Source Diffs on `trace-engine-lib` (0 Merge Conflicts on Rolls)
- [ ] **`Common.ParsedURL` (~540 lines of branch diff)**:
  - `trace-engine-lib` previously patched `NetworkDependencyTree.ts` (with a 518-line copy-paste of `ParsedURL`), `ScriptsHandler.ts`, and `Trace.ts` because `core/common` used to be stubbed as `export {};`.
  - Since `core/common/ParsedURL.js` is now a clean foundation module (only depending on `core/platform`), copy `core/common/ParsedURL.{js,d.ts}` in `scripts/trace/prep-trace-engine-package.sh`, export `ParsedURL` from `$dist/core/common/common.{js,d.ts}`, and revert `NetworkDependencyTree.ts`, `ScriptsHandler.ts`, and `Trace.ts` to match `origin/main`.
- [ ] **`HostRuntime.ts` Top-Level `await`**:
  - Revert `front_end/core/platform/HostRuntime.ts` to match `origin/main`, and write the synchronous `HOST_RUNTIME` stub to `$dist/core/platform/HostRuntime.js` in `scripts/trace/prep-trace-engine-package.sh`.
- [ ] **`export const enum` -> `export enum` (Upstream to `devtools-frontend` `main`)**:
  - Land a CL on `devtools-frontend` `main` changing `export const enum` to `export enum` in `front_end/models/trace/` (`LayoutShiftsHandler.ts`, `PageLoadMetricsHandler.ts`, `Threads.ts`, `SamplesIntegrator.ts`, `CLSCulprits.ts`, `File.ts`, `TraceEvents.ts`), and keeping `MarkerEventName` / `MarkerName` / `MarkerEvent` below `enum Name` in `TraceEvents.ts`.
- [ ] **`ImageDelivery.ts` Return Types (Upstream to `devtools-frontend` `main`)**:
  - Land a CL on `devtools-frontend` `main` changing the return types of `getOptimizationMessage` and `getOptimizationMessageWithBytes` in `front_end/models/trace/insights/ImageDelivery.ts` from `string` to `Platform.UIString.LocalizedString`.

### B. Replace `.js` `i18n` Regex Rewriting in `prep-trace-engine-package.sh`
- [ ] Replace the Python string-replacement pass for `i18n` in `scripts/trace/prep-trace-engine-package.sh` with a clean `$dist/core/i18n/i18n.js` shim module that implements `i18n.registerUIStrings`, `i18n.getLocalizedString`, `i18n.getLazilyComputedLocalizedString`, `i18n.lockedLazyString`, `ByteUtilities.bytesToString`, and `TimeUtilities.millisToString`.

### C. Upstream `scripts/trace/prep-trace-engine-package.sh` to `devtools-frontend` `main`
- [ ] Once `trace-engine-lib` has zero `front_end/` source modifications relative to `origin/main`, upstream the packaging script and templates to `devtools-frontend` `main` so `@paulirish/trace_engine` can be built and published directly from `main` without maintaining a separate branch.
