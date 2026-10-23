# Compatibility and troubleshooting

Start with evidence:

```text
node <skill>/scripts/inspect-target-project.mjs --project <project> --features <domain-a>,<domain-b>
node <skill>/scripts/compare-sdk-capabilities.mjs --target-sdk <NvStreamingSdk.js> --runtime-sdk-version <observed-x.y.z> --symbols <exact-symbol-a>,<exact-symbol-b>
node <skill>/scripts/query-api.mjs --symbol <exact-symbol> --bilingual
```

For one domain, `inspect-target-project.mjs --feature <domain>` remains valid. Pass every domain involved in one `--features` scan when a recipe crosses domains. For routine compatibility diagnosis, compare the complete actual API set used by the recipe with `--symbols`; use `--feature` only for an intentional domain-wide audit or when the exact set cannot yet be determined safely.

For an older, newer, or unknown SDK, use surface results rather than version assumptions. `surface-present` means only that the required symbol and observable parameter count exist; it is not a runtime-compatibility claim. `changed`, `missing`, `unknown`, and `unparseable` require explanation and a nonzero comparison result. `unparseable` means the target source layout is unsupported and never proves absence; request an unminified official SDK file or target documentation. For a newer target, answer only baseline symbols unless the customer supplies target documentation. Never upgrade the runtime SDK, replace it with the query copy, or apply the 3.16.0 declaration file to an incompatible runtime.

Treat `staticApiHeaderVersion` as non-authoritative metadata only. Once the user-approved WASM-backed `NvsStreamingContext` is ready, call `context.getSdkVersion()` and format its `majorVersion`, `minorVersion`, and `revisionNumber`; use `assets/samples/core/sdk-version.ts`. Pass that observed value to the inspector and capability comparer as `--runtime-sdk-version`. Report static and runtime versions separately and use only the runtime value for exact/older/newer posture. A mismatch proves only that the static header does not describe the observed runtime; record a non-blocking header metadata warning and block only when a required API is missing/changed or the requested runtime behavior fails.

Common failure classes:

- SDK API global is absent: for local delivery, verify the customer runtime was copied to `public/wasm/` and `/wasm/NvStreamingSdk.js` returns JavaScript rather than the SPA HTML fallback; for an existing CDN/runtime URL, verify that configured URL instead. In both cases the API script must load before WASM.
- `SharedArrayBuffer` or worker serialization fails: verify COOP/COEP on development, preview, and production responses, then check `crossOriginIsolated`; do not waive this because multithread decoding is disabled.
- Loader cannot fetch/compile: check `/wasm/`, HTTP status, WASM MIME, CORS, WebAssembly/WebGL, memory, and matching runtime files.
- Context absent after loader finish: verify matching JS/WASM and wait for `Module.Meishe.streamingContext`.
- Authorization failure: explain watermark/licensed-capability impact, direct the customer to Meishe business when authorization is not yet provisioned, then request the applicable customer authentication URL; do not bypass verification.
- Blank LiveWindow: verify canvas exists, timeline is connected, media is valid, and seek succeeds.
- Media fails: confirm the customer selected Meishe-transcoded m3u8 or WebLocal. For WebLocal inspect parser output, codec/resolution/session limits, `NvsAVFileInfo`, registration lifetime, and descriptor content; never copy the original video bytes into FS.
- Packaged feature fails: verify original file name, package type/ID, license, callback code, and `Ready` status.
- Headless browser initialization fails: if the SDK reports `Headless browser is not supported`, repeat WASM, authorization, playback, and audible-effect validation in a headed browser. Headless static/UI checks do not prove SDK runtime behavior; keep those results pending until the headed run passes.
- Edit fails during playback: stop and await `streamingEngineReadyForTimelineModification()` before structural or speed mutation. Serialize a just-committed slider/blur mutation before Play; do not let playback start while `changeSpeedWithOutPoint()` or another clip mutation is still queued.
- SSR crash: move all browser-global access behind a client-only lifecycle boundary.

Report which gate state blocks progress, the observed evidence, what the customer must supply, and the exact check that will resume work. If a missing optional font/sticker/test material does not prevent compilation/runtime, use an approved temporary test resource or validate the surrounding path without claiming the feature itself passed.
