# React and Vite integration

Keep the SDK singleton outside React render state. In the browser-only root effect for the editor route/project loader, call `startMeisheSdkForProjectLoad()` as soon as runtime and authorization configuration are available and retain its promise. Render the loading editor shell and canvas, then call `loadEditorProject()` from the project-loading effect so Timeline creation/loading, LiveWindow creation/connection, graph restoration, and any non-empty initial seek finish before editing controls become ready. SDK-independent project requests may run in parallel. File selection, upload, editing click, drag/drop, and play handlers may mutate the returned session but must never create its SDK/Timeline/LiveWindow foundation. React Strict Mode can mount, clean up, and mount again in development, so the startup helper must return the same in-flight promise and the project-loading effect must use a generation/cancellation guard: dispose a session that resolves after its effect was superseded, and never start two current sessions for one canvas. React effect cleanup cannot await directly; start the idempotent asynchronous editor-session cleanup with `void editor.dispose()` and surface cleanup failures through the project's error reporting. SDK startup is editor-application-owned and is not torn down by a temporary component remount.

Render the canvas before calling `createLiveWindow(canvasId)`. Do not recreate the timeline because props or component state changed; mutate the existing SDK objects through event handlers or a dedicated service. Do not place opaque SDK objects in Redux or serialize them.

Make the first runtime-version bootstrap the first phase of the final startup service, not a temporary component or throwaway UI. After `getSdkVersion()` is reported and the inspector is rerun, let the same singleton startup promise continue into project-session creation. The loading shell and final editor should own the same already-rendered canvas and the same session lifecycle.

`NvStreamingSdk.js` is loaded as a classic script. Its top-level `class` and `const` declarations are global lexical bindings, so they are available by identifier after SDK readiness but are not guaranteed properties of `window` or `globalThis`. Use `new NvsVideoResolution()` and `NvsLiveWindowFillModeEnum.PreserveAspectFit` after readiness; do not probe or call `globalThis.NvsVideoResolution` or `window.NvsLiveWindowFillModeEnum`. When a newer or non-baseline runtime needs TypeScript support, add only narrow project-owned ambient declarations for the verified identifiers instead of copying the 3.16 declaration bundle. For example:

```ts
export {};

declare global {
  interface NvsVideoResolution {
    imageWidth: number;
    imageHeight: number;
  }

  const NvsVideoResolution: { new (): NvsVideoResolution };
  const NvsLiveWindowFillModeEnum: { readonly PreserveAspectFit: number };
}
```

Vite considerations:

- Copy the verified customer delivery to `public/wasm/`; load `/wasm/NvStreamingSdk.js` and use `/wasm/` as the loader root. Do not point `publicDir` at a directory outside the project or import the Skill's query copy.
- If project tooling must resolve filesystem URLs on Windows, use `fileURLToPath(new URL(..., import.meta.url))`; never use URL `.pathname` as a Windows path.
- Guard any `window`, `document`, `Module`, or `FS` access from SSR evaluation.
- Do not evaluate SDK enums or constructors at module top level; reference their lexical identifiers only after SDK readiness.
- Configure both Vite `server.headers` and `preview.headers` with COOP `same-origin` and COEP `require-corp` (or a customer-approved equivalent), and require the production host to provide the same isolation. `enableMultithreadDecoding: false` does not remove this SDK build requirement.
- Gate loading on `globalThis.crossOriginIsolated === true` and an available `SharedArrayBuffer`.

Start from [sdk-startup.ts](../assets/samples/core/sdk-startup.ts), select a branch with [project-loading.ts](../assets/samples/core/project-loading.ts), and pass it through [editor-bootstrap.ts](../assets/samples/core/editor-bootstrap.ts); split out [runtime-environment.ts](../assets/samples/core/runtime-environment.ts), [sdk-loader.ts](../assets/samples/core/sdk-loader.ts), or [editor-session.ts](../assets/samples/core/editor-session.ts) only when the project already owns the other lifecycle phases. A component owns the canvas and project-session lifecycle, not SDK foundation creation in event handlers.

Validate with one mount/unmount/remount cycle, then confirm a single usable context, one LiveWindow for the canvas, seek/playback callbacks, and complete cleanup.
