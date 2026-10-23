# Framework-neutral browser integration

Use three explicit boundaries: runtime loading, project session ownership, and feature commands. Start `startMeisheSdkForProjectLoad()` when entering the editor or beginning project loading, then call `loadEditorProject()` after the loading canvas exists. Project readiness must include Timeline creation/loading, LiveWindow creation/connection, project graph restoration, and a non-empty initial seek; an empty Timeline may enter `empty-ready` after connection. Prevent concurrent current sessions for one canvas. Never let file selection, upload, editing click, drag/drop, or playback create that foundation; handlers mutate the ready session only. Keep SDK objects in module-local/session state; pass them to pure command functions rather than storing them in DOM data attributes or serialized state.

Recommended order:

1. Verify WebAssembly/WebGL, browser LocalStorage, and customer runtime URLs.
2. Apply the required LocalStorage environment before loading the matching Emscripten module.
3. Wait for `Module.Meishe.streamingContext`, initialize internal resources, and complete required authorization.
4. Register project callbacks, read/create project metadata, and resolve referenced resources.
5. Create or load the Timeline, create/connect the LiveWindow, restore default or persisted project objects, then seek before readiness.
6. Stop, disconnect, remove LiveWindow, await engine readiness, and remove the timeline on teardown.

Use [sdk-startup.ts](../assets/samples/core/sdk-startup.ts) from the editor/project loading lifecycle, select a branch with [project-loading.ts](../assets/samples/core/project-loading.ts), and pass it to [editor-bootstrap.ts](../assets/samples/core/editor-bootstrap.ts). For custom elements, keep SDK/project initialization at the editor application boundary; create the project session in `connectedCallback()` after the canvas is present and start its asynchronous cleanup in `disconnectedCallback()`. For plain editor pages, begin SDK and project initialization while loading the editor, then pair session setup with `pagehide` or the application's route teardown and retain the cleanup promise where the router supports awaiting it.

Validate repeated setup/teardown and ensure there is no server-side access to `window`, `document`, `Module`, or `FS`.
