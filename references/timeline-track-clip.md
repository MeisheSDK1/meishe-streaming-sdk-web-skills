# Timeline, track, and clip

Use the Timeline group in [sample-index.md](sample-index.md) for track lifecycle, timed insertion, Split, move, Trim, range removal, readiness-safe structural mutation, settings, snapshots, and nested-timeline ownership. Use [clip-structure.ts](../assets/samples/video/clip-structure.ts) for shifting a video clip's whole trim window with `moveTrimPoint()`.

Create or load the project Timeline during editor/project loading, never from a media-import or editing interaction. Use `NvsVideoResolution`, `NvsRational`, and `NvsAudioResolution` for a new Timeline. Width must be a multiple of 4, height a multiple of 2, and the audio sample rate must be 44100 or 48000. The Web editor's supported default flag combination is `DontAddDefaultVideoTransition | ForceAudioSampleFormatUsed | RecordingUserOperation | SyncAudioVideoTrasitionInVideoTrack`; override it only for a documented requirement. The standard hierarchy is timeline → video/audio track → clip. Keep SDK object identity intact and store application metadata separately.

Minimal empty-project import path, assuming project loading already created and connected `timeline`:

```ts
await context.streamingEngineReadyForTimelineModification();
const track = timeline.appendVideoTrack();
const clip = track.appendClip(mediaPath);
if (!clip) throw new Error('Video clip could not be appended.');
context.seekTimeline(
  timeline,
  clip.getInPoint(),
  NvsVideoPreviewSizeModeEnum.LiveWindowSize,
  0,
);
```

Use `appendClip2()` for explicit trim-in/trim-out, or the documented add/insert variants when timeline placement differs. Time values are microseconds. Before structural edits during playback, await `streamingEngineReadyForTimelineModification()`.

For a full validation editor, read [editor-workflow-patterns.md](editor-workflow-patterns.md). It defines stable UI IDs, highest-only user-track interval placement, hidden transparent base-track duration, global selection, blank-space clearing, and command-bar deletion.

Use `getInPoint()`, `getOutPoint()`, `getTrimIn()`, `getTrimOut()`, track clip counts, and index lookup to verify the result. Do not assume insert or trim succeeds; inspect the returned object/value. Seek after mutation to refresh preview.

Remove dependent effects/captions/stickers according to ownership, then remove tracks/timeline when the project session ends. Query all symbols with `--domain timeline-track-clip`.
