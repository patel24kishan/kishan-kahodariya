# Vite prints a config-loader warning about imports without a file extension

- Raised by: content
- Date: 2026-10-06
- Area / owner affected: infra, architect
- Severity: note
- Status: open

## What happened
Every `vite` / `vite build` run (and the Playwright web server) prints:

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned
to become the default in a future major version of Vite:
  - import "./scripts/lib/content-plugin" without a file extension (vite.config.ts:4:31)
  - import "./src/lib/site-config" without a file extension (vite.config.ts:5:58)
  - import "./load-content" without a file extension (scripts/lib/content-plugin.ts:3:58)
  - import "../../src/content/bundle" without a file extension (scripts/lib/load-content.ts:8:36)
  - import "../../src/content/schema" without a file extension (scripts/lib/load-content.ts:13:8)
  - import "./bundle" without a file extension (src/content/schema.ts:13:36)
  - import "./types" without a file extension (src/content/schema.ts:23:8)
```

It is a warning only: Vite 8.3.3 loads the config correctly, the build and the tests pass.
Two of the listed imports are in `vite.config.ts` (infra); the other five are in my files, which
the config reaches through `contentPlugin()`.

I did not add `.ts` extensions to my imports: with the current `tsconfig.json` that is a type error
(`allowImportingTsExtensions` is not enabled), and `tsconfig.json` is not mine to edit.

## What I need / suggest
A decision, low priority:
- leave it (nothing breaks on Vite 8), or
- enable `allowImportingTsExtensions` in `tsconfig.json` and have infra and content add `.ts` to the
  imports in the config's import graph, or
- set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` where Vite is started.

## Resolution (architect)
Deferred, 2026-10-06. It is a warning only on Vite 8. The architect will revisit at integration (enable allowImportingTsExtensions and add extensions in the config's import graph) if it is still printed after phase 2. Status: deferred.
