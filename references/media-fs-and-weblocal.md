# Media FS, Meishe-transcoded M3U8, and WebLocal

Choose the active media strategy with the user before a first installation or implementation. The choice may be M3U8, WebLocal, or both (`mixed`):

1. Recommend Meishe backend transcoding for original customer media. The resulting m3u8 has Meishe-specific contents; ordinary HLS m3u8 is not interchangeable.
2. Offer WebLocal as an explicit alternative only after the customer accepts narrower format/codec/resolution coverage, browser-memory limits, and session-only `File` registration. Original URL media avoids that registration but requires a stable HTTP(S) URL whose server supports browser CORS and byte-range requests. Do not install `mediabunny` until WebLocal is selected; if it is then absent, explain it and wait for explicit conversational approval before installation.
3. Use `mixed` when both paths must remain active. Require the M3U8/backend input and the WebLocal local-file input, apply both ownership models, and include `mediabunny` only because WebLocal is active. A single-strategy decision does not remove the other existing project path, but that inactive path must not add dependencies or validations to the current integration.

Before dependent implementation, tell the customer which validation input is required. Meishe-transcoded m3u8 needs actual output from the customer's Meishe backend service (or its integration contract); ordinary HLS is not interchangeable. WebLocal needs a supported local validation file. A mixed strategy needs both. Reject input kinds that belong only to an inactive path, and never reuse a media URL or file discovered in another workspace project without explicit approval.

Never read an original video with `File.arrayBuffer()` and write the full buffer to SDK FS. SDK FS byte helpers are for explicitly bounded resources such as descriptors, fonts, licenses, and asset packages. A WebLocal descriptor is a small JSON file; the media remains a browser `File` registered with the SDK.

Use `assets/samples/media/sdk-fs-paths.ts` as the authoritative integration FS root contract. It includes `/localmedia` alongside the roots extracted from the production editor. Create all roots idempotently after WASM/Module readiness and before `initInternalResources()`. Every write must be an absolute normalized path below an operation-specific allowed root; reject arbitrary top-level directories even when they could be created. Keep `/weblocal` distinct and do not substitute it for `/localmedia` without target-project evidence.

## Meishe-transcoded M3U8 flow

Use [transcoded-m3u8-media.ts](../assets/samples/media/transcoded-m3u8-media.ts) as the low-freedom flow:

1. Confirm that the URL is output from the Meishe transcoding service. An ordinary HLS playlist is not a supported substitute even when its extension is `.m3u8`.
2. Fetch the manifest with CORS. The manifest and every referenced segment must remain reachable with the required CORS and range behavior; do not download the segments into SDK FS.
3. Read the small manifest as `new Uint8Array(await response.arrayBuffer())` to preserve its response bytes. `await response.text()` can also work when the service guarantees a compatible text encoding, but it returns a decoded string that `FS.writeFile()` must encode again.
4. Write only the bounded manifest to `/m3u8/<uuid>.m3u8`, then call `getAVFileInfo(path, 0)`. Require video type, positive duration, and positive dimensions. On any fetch, abort, write, or validation failure, remove the owned SDK FS file and surface a scoped error without disabling unrelated local imports.
5. Await `streamingEngineReadyForTimelineModification()` before `addClip()`. Keep the manifest alive while any clip references it.
6. Validate an actual rendered first frame, a seek into a later segment, and playback across a segment boundary. Metadata success alone does not prove segment loading and decoding.
7. During teardown, stop playback and remove the owning timeline/clip objects before disposing the manifest resource.

Do not assume APIs named for Local AV, such as `getLocalAVFileThumbnail()`, support M3U8. Use an existing placeholder or a separately verified timeline-frame workflow. A Trial Version watermark indicates authorization state, not an M3U8 loading failure. When the static `@version` header differs from `context.getSdkVersion()`, record the header as inaccurate metadata for the observed runtime; do not create a separate approval or supplier-confirmation gate unless a required API is missing/changed or runtime behavior fails.

Applications may use both strategies. Store an explicit runtime assignment such as `const mediaSourceType = 'weblocal'` versus `const mediaSourceType = 'transcoded-m3u8'`, or the equivalent key in JSON/YAML configuration; this is durable evidence for later tasks. Type/interface declarations, UI labels, and bare `.m3u8` strings are not decisions. Preserve each strategy's ownership rules and isolate failures so one unavailable remote manifest does not break the editor or WebLocal imports.

## Local video flow

Use [web-local-media.ts](../assets/samples/media/web-local-media.ts) as the low-freedom flow derived from the production editor and its dependencies:

1. Detect a local extension. Production `AV_SUPPORTED` includes MP4/M4V/M4A/MOV/MP3/WAV and `IMG_SUPPORTED` includes JPG/JPEG/PNG; its URL detector tries the path then HEAD/MIME. A video-only local sample should prefer MP4/M4V. MOV enters detection but is rejected when `mediabunny` identifies QuickTime File Format.
2. Parse with `mediabunny` using MP4/QTFF/MP3/WAVE support. Read duration, tracks, rotation, pixel aspect ratio, audio layout, and average bitrate from at most the first 100 packets per track.
3. Reject an empty/unknown track, video codecs other than AVC/HEVC, video dimensions above 1920x1080, QuickTime format, and a local file larger than `navigator.deviceMemory` in bytes. Any rejection requires Meishe transcoding instead of a silent fallback.
4. Align total and stream durations to the production 25fps/40ms rule. Build truthful metadata; never use placeholder duration, bitrate, dimensions, sample rate, or channel count.
5. Register the `File`, write `/localmedia/<uuid>.weblocal` below the root created during SDK initialization, then call `getAVFileInfo()` as the SDK-side validation. If it fails, delete the descriptor, unregister the file, and request transcoding.
6. Await `streamingEngineReadyForTimelineModification()` before adding the descriptor path to a track. Keep the registration alive while any clip uses it.
7. On teardown, stop/remove owning timeline objects first, delete the descriptor, and call `unregisterLocalFile()`.

The production call chain also stores the descriptor string for XML/IndexedDB reconstruction and optionally requests `getLocalAVFileThumbnail()` and `getLocalAVFileWaveformData()`. Persisting the descriptor does not persist a browser `File` registration: after reload, require the user to select the local file again or mark the clip offline. For an original URL, use `inspectWebLocalVideoUrl()` and `createWebLocalVideoFromUrl()` from [web-local-media.ts](../assets/samples/media/web-local-media.ts). They normalize an absolute credential-free HTTP(S) URL, parse it through `UrlSource`, apply the same format/codec/resolution checks as a local file, and write `webAssetUrl` instead of registering a browser `File`. URL parsing success proves the current CORS/range path only; revalidate restored URLs and keep offline/error handling.

The production image branch uses `getFileFromUrl()` to download URL images when needed and `ExifReader` for orientation/dimensions. It is separate from video preview; do not add `ExifReader` to a video-only integration.

Relevant APIs include `registerLocalFile()`, `unregisterLocalFile()`, `getAVFileInfo()`, `notifyUpdateToWebReader()`, `getLocalAVFileThumbnail()`, `getLocalAVFileWaveformData()`, `changeClipFilePath()`, and `getFilePath()`. Query exact signatures before use.

Gate missing media, transcoding output, parser installation, CORS, range behavior, and metadata extraction as external dependencies. Validate with the SDK file-info result, an actual rendered seek, cross-segment playback, playback callbacks where requested, failure isolation, and complete cleanup. Without customer media/runtime, report `pending-user-runtime`.
