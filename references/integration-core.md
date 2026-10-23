# Core integration workflow

Use this guide only when integrating or changing SDK initialization and project loading. Apply the mode, inspection, compatibility, routing, and dependency-gate rules from `SKILL.md` before this concrete lifecycle.

Runtime prerequisites are an official customer-provided SDK JavaScript/WASM pair, browser WebAssembly and WebGL, correct server MIME/CORS behavior, cross-origin isolation, and authorization data when the customer's license terms require it. Treat absent external runtime files or required authorization as `missing-external`.

For a new local-delivery integration, first report the exact customer delivery source, destination, file set, and conflict-safe installer behavior. Wait for explicit user confirmation in the conversation before installing its complete contents into `<project>/public/wasm/`; automatic tool or sandbox approval does not count. Existing projects may instead use a configured CDN URL for both SDK JavaScript and WASM; preserve that flow rather than relocating it.

```text
node <skill>/scripts/install-runtime.mjs --source <customer-sdk-directory> --project <project> --user-confirmed-copy
```

The installer is conflict-safe: it accepts an identical destination or atomically fills an existing empty destination, but refuses an incomplete source, symlinks, or differing existing files. Do not use the source directory as Vite `publicDir`, merge releases, or copy the Skill's query-only SDK. After installation, rerun the same inspector command with the same `--runtime-source` so source/destination hashes and provenance remain available; omitting the source can reduce later provenance evidence to unknown. Then load `/wasm/NvStreamingSdk.js` and pass `/wasm/` to `loadEmscriptenModule()`.

`meishewasmloader` is required but not bundled. When it is already declared, preserve the project's version and do not query npm merely to check freshness. If it is absent, explain the dependency and exact package-manager command, then wait for explicit user confirmation in the conversation before installing it. A tool-layer auto-approval is not customer confirmation. Rerun the inspector afterward. Upgrade or downgrade an existing loader only when runtime diagnostics establish that its version is the problem and the user authorizes the change.

Treat missing COOP/COEP configuration the same way: explain the development/preview files to change and the separate production-host requirement, then wait for explicit user confirmation before editing project configuration.

For a configured local/CDN runtime, do not bind API compatibility to an arbitrary SDK file. Capture the configured SDK URL response or obtain explicit customer confirmation that the supplied file is the deployed delivery, retain its normalized SHA-256 in the inspector report, and pass the matching `--target-sdk-provenance` attestation. Runtime `getSdkVersion()` remains separately required and does not by itself prove JavaScript/WASM provenance.

Use [sdk-startup.ts](../assets/samples/core/sdk-startup.ts), [project-loading.ts](../assets/samples/core/project-loading.ts), and [editor-bootstrap.ts](../assets/samples/core/editor-bootstrap.ts) as the low-freedom, framework-neutral complete flow. Use the smaller Core samples when the customer already owns part of the lifecycle.

Start `startMeisheSdkForProjectLoad()` when entering the editor or beginning to load an editing project, as soon as runtime and authorization configuration are available. A lazy editor route may start it when that route loads; a non-editor landing page does not need to preload the SDK. Independent project data may load in parallel, but project readiness must await the returned singleton promise. File selection, upload, editing click, drag/drop, and playback handlers may await that promise but must never initiate SDK API/WASM loading. Resuming the browser audio context is a separate gesture-gated operation and does not delay SDK initialization.

The required order is:

1. From the editor/project loading lifecycle, call [sdk-startup.ts](../assets/samples/core/sdk-startup.ts). It applies [runtime-environment.ts](../assets/samples/core/runtime-environment.ts) before WASM and starts one reusable initialization promise. Its project-verified normal defaults reproduce the production editor's active `setSdkReaderCount()` and `setSdkEnv()` settings: 128 image readers, 15 video readers when `VideoEncoder` exists (otherwise 10), and WebCodecs hardware-decoder preference enabled. The reference editor also contains a historical low-memory Windows branch that changes the context image-reader limit to 8; do not copy its UA heuristic. Use a lower explicit caller value only for a verified target-device policy. These values persist for the browser origin.
2. The startup helper calls [sdk-loader.ts](../assets/samples/core/sdk-loader.ts) with `/wasm/`. It loads/verifies `/wasm/NvStreamingSdk.js` first, requires cross-origin isolation, then loads WASM. Loader completion is followed by a timeout-bound wait for `Module.Meishe.streamingContext`, idempotent creation of the prescribed SDK FS roots from [sdk-fs-paths.ts](../assets/samples/media/sdk-fs-paths.ts), internal-resource initialization, and the explicitly selected authorization path. Never accept caller-defined top-level FS roots.
3. Run the authorization capability gate before creating feature objects.
4. While the editor is still in its project-loading state, render and size the canvas, create or load the Timeline, create/connect the LiveWindow, restore the project graph, and seek the initial frame when the Timeline is non-empty. An empty Timeline may enter `empty-ready` after connection and must seek after its first media mutation.
5. On teardown, dispose callback/audio owners and await the editor session's asynchronous cleanup.

Keep these lifecycle boundaries explicit:

| Phase | Required work |
| --- | --- |
| Runtime | SDK API/WASM, context readiness, prescribed SDK FS roots, internal resources, authorization/capability gates |
| Project loading | context callbacks, project metadata/XML and resource resolution, Timeline creation/loading, LiveWindow creation/connection, optional application-required default tracks or existing-project graph restoration, initial resize and non-empty seek |
| Ready interaction | create/select a track when needed, add/import/replace clips, request thumbnails/waveforms, edit, play, drag-seek |
| Teardown | stop, callbacks, LiveWindow disconnect/removal, readiness, Timeline removal, project resources |

Do not collapse Project loading into an import handler. Prevent concurrent project-session creation; a framework remount may reuse SDK startup but must dispose or supersede an in-flight project load before creating another session. Import handlers may mutate only the Timeline created during Project loading; they never create the Timeline or LiveWindow. When using the default validation editor, follow [editor-workflow-patterns.md](editor-workflow-patterns.md): import registers catalog assets without adding them to tracks. Existing application XML must be parsed into validated application data before SDK graph reconstruction. Resolve referenced packages/fonts/media and mark session-only WebLocal files offline when their browser `File` registration cannot be restored. SDK-native project XML instead uses `loadProject()` and returns an owned Timeline to connect.

Use [engine-lifecycle.md](engine-lifecycle.md) for the authoritative authorization decision, capability gate, initialization checks, and cleanup order. The sequence above is an orchestration summary that selects and connects the complete integration samples; do not fork the detailed lifecycle policies.
