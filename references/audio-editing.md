# Audio editing

Use [audio-editing.ts](../assets/samples/audio/audio-editing.ts) for timed insertion, channel gain, fades, stream selection, one-off built-in effects, `Audio LoudNorm`, audio-volume keyframes, and the SDK's currently supported `Fade` audio transition. Use [audio-fx-management.ts](../assets/samples/audio/audio-fx-management.ts) for editor-owned audio-effect state, [microphone-recording.ts](../assets/samples/audio/microphone-recording.ts) for browser recording and cleanup, and [variable-speed.ts](../assets/samples/timeline/variable-speed.ts) for audio/video speed changes with an explicit out-point.

Append an `NvsAudioTrack`, then use `appendClip()` or `appendClip2()` with an SDK-readable media path. For audio-only preview that still requires video output, add a documented visual/background clip rather than assuming the monitor can render an empty video timeline.

Use `setVolumeGain()`, fade duration APIs, audio-stream selection, and speed methods on the owning clip/track class. Audio effects belong to `NvsAudioClip`: use `appendFx()`, `insertFx()`, `getFxByIndex()`, and `removeFx()` with a verified built-in effect name. Track transitions are configured by source clip index.

## Managed built-in audio effects

The following identifiers and parameter contracts are the SDK 3.16.0 runtime-validated baseline for this Skill. They are effect schema, not API symbols, so `query-api.mjs` cannot establish their names or ranges.

| Purpose | Built-in effect | Parameter | Setter/getter | Default | Range |
| --- | --- | --- | --- | ---: | ---: |
| Loudness normalization | `Audio LoudNorm` | `Integrated Loudness` | Float | `-23` LUFS | `[-70, -5]` |
| Noise suppression | `Audio Noise Suppression` | `Level` | Int | `1` | `[1, 4]` |

The runtime-validated preset names are `Fast Cartoon Voice`, `Audio Reverb`, `Audio Wahwah`, `Female Voice`, `Male Voice`, `Cartoon Voice`, `Audio Echo`, and `Monster Voice`. Keep UI labels product-owned; do not infer a display label from an SDK identifier.

Treat only an explicit allowlist as editor-managed. Enumerate with `getFxCount()`/`getFxByIndex()` and identify built-ins with `getBuiltinAudioFxName()`. Remove matching effects from highest index to lowest, preserve every unrecognized effect, and keep at most one managed preset. Selecting an unprocessed/native option removes only the preset allowlist; it must not remove loudness normalization or noise suppression.

Read SDK FX state when selecting or snapshotting a clip instead of treating panel state as authoritative. Use the matching typed getter and setter, validate values before mutation, and check every append/remove result. For undo, redo, project snapshot restoration, or Split, rebuild managed effects in the deterministic order loudness, noise suppression, then preset. If restoration fails after a partial rebuild, remove the partial managed stack and restore the previous managed snapshot without touching unrelated effects.

For `NvsVideoClip` audio, use `appendAudioFx()`, `getAudioFxByIndex()`, and `removeAudioFx()` rather than the `NvsAudioClip` methods. Do not silently expand an audio-only product requirement to video-clip audio.

Microphone recording additionally requires a secure browser context, explicit user permission, and a writable SDK FS file below `/record`. Reject all other roots. `NvsAudioFileWriter` consumes interleaved Float32 stereo PCM blocks; duplicate mono input into both channels rather than assuming the device exposes channel 2. Keep its processing node connected while recording, always call `close()` to finalize the file and release WASM resources, then stop tracks, disconnect Web Audio nodes, and delete cancelled output.

Do not infer channel layout, sample rate, duration, or waveform data. Obtain them from `NvsAVFileInfo`, the customer's metadata pipeline, or a verified parser. Browser audio may need an explicit user gesture before `nvsResumeAudioContextWithPromise()`.

Validate clip duration and placement, both volume channels, fade boundaries, selected audio stream, managed effect count and names, typed parameter boundary round-trips, coexistence with an unrelated effect, preset exclusivity/native clearing, Split on both children, undo/redo restoration, waveform/metadata callbacks when used, audible playback, and cleanup. Query `--domain audio-editing` for API symbols; use the schema above for built-in effect identifiers and parameters.
