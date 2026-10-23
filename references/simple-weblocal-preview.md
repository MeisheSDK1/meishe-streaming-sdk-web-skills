# Simple React/Vite WebLocal preview

Use this bounded recipe for local video selection, one Timeline video clip, fitted LiveWindow preview, seek/playback, and owned cleanup. It is not a full editor and does not add unrelated catalogs, inspectors, persistence, export, or effects.

## Inspect and release gates

List the preset when needed, then use it instead of manually maintaining a long `--required-symbols` list:

```text
node <skill>/scripts/inspect-target-project.mjs --list-recipes
node <skill>/scripts/inspect-target-project.mjs --project <project> --recipe simple-weblocal-preview --runtime-source <customer-sdk-directory>
```

The recipe supplies only its five participating domains and complete static SDK-symbol set. It does not choose authorization or media policy, authorize mutations, attest provenance, or provide a media file. After the user chooses WebLocal and the authorization mode, rerun with `--media-strategy weblocal --authorization-mode required|skip`. Add `--media-input-kind local-file` only when an actual supported local validation file is available.

If runtime installation is approved, install the verified delivery and rerun the same recipe command with the same `--runtime-source`; this preserves source/destination hash comparison and provenance. After the browser context returns `getSdkVersion()`, rerun again with `--runtime-sdk-version <x.y.z>`. The preset keeps the symbol comparison identical across these passes. Add `--required-symbols` only for APIs the target implementation actually adds; explicit symbols are unioned with the preset.

## Implement the smallest final flow

Use one application-owned startup promise and one project session:

1. Render the loading shell and canvas. Start the final SDK service immediately from the editor/project-loading effect.
2. Load the classic SDK script and WASM, wait for context readiness, initialize resources, run the selected authorization path, and report `getSdkVersion()` before feature objects are created.
3. After the inspector releases feature implementation, create the Timeline and LiveWindow in that same service, connect them, and keep them across ordinary React renders.
4. On file selection, use [web-local-media.ts](../assets/samples/media/web-local-media.ts) to inspect/register the local file and verify it with `getAVFileInfo()`. Populate the material card first; add its descriptor path to the existing video track from the card's working add action. Do not create the Timeline or LiveWindow in either handler.
5. Seek the first rendered frame, resume audio only from a user gesture, and use [playback-controller.ts](../assets/samples/timeline/playback-controller.ts) for play/pause and callback ownership.
6. Dispose the media owner, callbacks, connection, LiveWindow, track, and Timeline in the documented ownership order. Revoke browser resources even when a later SDK cleanup step fails.

Do not build a temporary version-check page and then replace it with a second bootstrap. The loading shell and finished preview must share the same startup promise, canvas ownership, and terminal failure state.

## React globals and types

Follow [framework-react-vite.md](framework-react-vite.md). SDK constructors and enums declared by the classic script are global lexical bindings: reference `NvsVideoResolution` or `NvsLiveWindowFillModeEnum` directly after readiness, not through `window` or `globalThis`. Do not copy the bundled 3.16 declarations into a newer or unverified runtime. If TypeScript needs help, add narrow project-owned ambient declarations only for symbols confirmed by the recipe comparison.

## Minimal UI and validation

When the project has no reusable UI system, use `DefaultEditorUi` from [the default UI sample](../assets/samples/ui/DefaultEditorUi.tsx) with its companion CSS and geometry helpers. Even for this narrow recipe, the validation UI directly shows navigation, material/import, preview, inspector, and bottom Timeline regions; show only Material in navigation and use the inspector's empty/selected-clip states. Do not invent a reduced layout. Keep the sample's ruler, label column, track height, thumbnail width, zoom range, and shared pixel-to-time mapping instead of approximating them.

Validate one supported local file through metadata parsing, registration, `getAVFileInfo()`, clip insertion, rendered seek, playback callbacks, pause/stop, and cleanup. Also verify one React mount/unmount/remount cycle, one context, one LiveWindow for the canvas, no duplicate callbacks, no staging directories, and no leaked object URLs or WebLocal registrations. Treat production COOP/COEP and any unavailable customer media/browser run as pending rather than passed.
