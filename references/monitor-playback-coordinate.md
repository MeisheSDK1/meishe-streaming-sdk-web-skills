# Monitor, playback, and coordinates

Use the LiveWindow group in [sample-index.md](sample-index.md) for connection, canvas sizing, coordinate conversion, overlay discovery/hit-testing, and transforms. Use [editor-session.ts](../assets/samples/core/editor-session.ts) when one owner creates both Timeline and LiveWindow, and [playback-controller.ts](../assets/samples/timeline/playback-controller.ts) for callback-safe seek/play/stop and preview-rate control.

Create `NvsLiveWindow` only after its canvas exists, but do so during editor/project loading rather than a media or playback interaction. Connect the project Timeline with `connectTimelineWithLiveWindow()`, configure `setFillMode()` using a verified `NvsLiveWindowFillModeEnum` member, restore project content, and call `seekTimeline()` before marking the project ready. Later import and playback handlers must reuse this connected session.

Keep the canvas CSS size separate from its backing store. Align the backing width to a multiple of 4 and height to a multiple of 2 after applying device-pixel ratio. The Core session defaults to `PreserveAspectFit`.

When the preview participates in a resizable editor shell, follow [default-editor-ui.md](default-editor-ui.md): observe its actual viewport, resize both stage and Canvas backing store, and seek back to the pre-resize Timeline position. Property edits and resize refreshes must not jump to the selected clip in-point.

Playback uses timeline microseconds:

```ts
context.seekTimeline(timeline, 0, NvsVideoPreviewSizeModeEnum.LiveWindowSize, 0);
context.playbackTimeline(
  timeline,
  0,
  timeline.getDuration(),
  NvsVideoPreviewSizeModeEnum.LiveWindowSize,
  true,
  0,
);
```

Use SDK callbacks to update UI position and playback state; do not drive SDK timing from a UI timer. Resume browser audio from a user gesture with `nvsResumeAudioContext()` or `nvsResumeAudioContextWithPromise()` when needed.

`LiveWindowSize` is the recommended general preview mode. Pass seek/playback flags as explicit feature options. `BuddyHostVideoFrame` and `BuddyHostOriginVideoFrame` are normally for companion-frame/face-detection workflows and must not be enabled as general defaults. Real-time background segmentation with `Object Stroke` requires `NvsSeekFlagEnum.BuddyHostVideoFrame` for seek and `NvsPlaybackFlagEnum.BuddyHostVideoFrame` for playback in the validated Web 3.16.2 runtime; keep target-runtime render validation pending for other versions. When using `AllowFastScrubbing`, call `setTimelineScaleForSeek()` with a validated seconds-per-pixel value before every seek carrying that flag. Stop active playback before seek unless the integration has verified a different ownership model.

The canonical/timeline origin is centered with positive Y upward; browser view origin is top-left with positive Y downward. Convert with `mapViewToCanonical()`, `mapCanonicalToView()`, `mapViewToNormalized()`, or `mapNormalizedToView()` before editing spatial properties. Convert browser client coordinates through the canvas bounding rectangle and backing-store scale first; do not pass raw `clientX/clientY` when CSS size and canvas size differ.

Coordinate conversions require a connected, laid-out LiveWindow. Recompute from the current canvas rectangle after resize. `getPixelColor()` accepts view coordinates, not canonical or normalized coordinates.

On teardown, `stop()`, disconnect, and remove the LiveWindow. Validate initial seek, play/pause/stop, coordinate round-trip, resize behavior, and cleanup.
