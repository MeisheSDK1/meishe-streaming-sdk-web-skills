# Engine lifecycle

Treat an actual `verifySdkLicenseFile` call as an existing authorization flow, not proof that its callback succeeded. If the project already has the complete SDK load, context creation, and internal-resource initialization flow, preserve it and do not ask for a separate authorization decision during feature integration; report authorization result and requested capabilities as pending runtime validation. If only an authentication URL reference exists, use it to implement verification without exposing its value. The explicit-decision requirements below apply only to an empty integration with none of those signals; do not infer authorization from `.env`.

Start initialization when entering the editor or beginning to load an editing project, as soon as runtime and authorization configuration are available, and retain its singleton promise. It may run alongside SDK-independent project data loading, but the editor/project must not report `ready` until the promise resolves. Never defer SDK API/WASM loading to file selection, upload, editing click, drag/drop, or playback; those handlers may only await or reuse the project-load promise. The supported initialization sequence is pre-WASM LocalStorage environment, cross-origin-isolation check, SDK API script, loader completion, a timeout-bound wait for `Module.Meishe.streamingContext`, `nvsGetStreamingContextInstance()`, prescribed SDK FS root creation, `initInternalResources()`, then the explicit authorization decision. In `required` mode, use `onWebRequestAuthFinish` as the asynchronous result and `verifySdkLicenseFile()` only with the customer-provided URL. A false immediate return means the request did not start. Retry a failed request at most three times, then block initialization. In `skip` mode, require recorded customer acknowledgement of the watermark/capability impact. After verification, use `assets/samples/core/capability-gate.ts` to check every requested editing capability with `functionalityAuthorised()` before creating the corresponding object; a valid license request does not imply that every feature is enabled.

After SDK readiness, keep the editor in its project-loading state while registering context/package callbacks, reading or creating project metadata, creating/loading the Timeline, creating/connecting the LiveWindow, restoring default or persisted project objects, and performing the initial seek for a non-empty Timeline. An empty Timeline may become `empty-ready` after connection and seeks after its first media mutation. File import and other editing commands operate only on this ready project session. Do not make them repair or lazily create missing Timeline/LiveWindow infrastructure.

Before requesting the decision, explain that an unverified SDK may show the default Meishe watermark in timeline preview and generated content, and licensed features may remain unavailable. Direct customers who need production authorization to Meishe business, then request the project-accessible authentication URL issued/configured for their deployment. Do not log or persist the URL in task output.

Loader completion and streaming-context readiness are distinct states in the production integration. Do not call the context getter from the loader callback without the readiness wait. If adapting the loader to an already-created context, set `internalResourcesAlreadyInitialized` only when the existing project proves it already completed `initInternalResources()`; context presence alone is insufficient. Install [resume-audio-context.ts](../assets/samples/core/resume-audio-context.ts) after the SDK becomes ready so a browser user gesture can resume audio; dispose pending gesture listeners with the owning editor lifecycle.

Keep the project-load initialization promise terminal after any failure. The loader already owns its bounded authorization retries; callers must not clear a rejected startup promise and invoke the complete loader again in the same page. A second complete attempt could repeat `initInternalResources()` against a partially initialized singleton context. Reload the page before retrying SDK startup or authorization after the bounded attempt fails.

Before timeline mutations that may race playback, call `streamingEngineReadyForTimelineModification()` and await it. Inspect `getStreamingEngineState()` when diagnosing state-dependent failures. Use `stop()` before disconnecting or destroying active preview objects.

Cleanup order for an owned editor session:

1. Stop playback.
2. Disconnect the LiveWindow.
3. Remove the LiveWindow.
4. Await `streamingEngineReadyForTimelineModification()`.
5. Remove the timeline.
6. Release project-owned object URLs and SDK FS files.

Do not destroy resources owned by another session. Represent owned and borrowed Timelines explicitly; only an owned Timeline may be removed during setup failure or disposal. Do not overwrite global callbacks without preserving or deliberately multiplexing the previous handler. Await the session's `dispose()` promise. Keep completed cleanup stages committed, allow a rejected disposal to retry unfinished stages, and retain canvas ownership until every stage succeeds. Validate cleanup by recreating a session on the same canvas and seeking a frame.

Query the complete domain with `node <skill>/scripts/query-api.mjs --domain engine-lifecycle`. Older, newer, and unknown SDKs must pass the required baseline surface check before code is changed; never upgrade them silently.
