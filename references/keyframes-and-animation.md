# Keyframes and animation

Use [parameter-keyframes.ts](../assets/samples/effects/parameter-keyframes.ts) for typed effect parameters, [clip-transform-keyframes.ts](../assets/samples/effects/clip-transform-keyframes.ts) and [caption-keyframes.ts](../assets/samples/captions/caption-keyframes.ts) for grouped transforms, and [keyframe-inspection.ts](../assets/samples/effects/keyframe-inspection.ts) for keyframe discovery. These are property keyframes, not material-package animations. Select the matching video/caption/sticker package-animation sample from [sample-index.md](sample-index.md).

Video package animation uses Property Video FX slots. Slot 1 is either in-animation or loop animation; slot 2 is out-animation. `Package Id`/`Package2 Id` act on the raw source, while `Post Package Id`/`Post Package2 Id` act on the composed timeline frame. The SDK slot does not reliably encode whether slot 1 is an in-animation or loop animation, so persist that distinction in application-owned state. A video loop animation and out-animation cannot occupy the slots together.

Treat video animation as a full lifecycle. Install packages through the shared single-flight coordinator, require every referenced package to be `Ready` before changing the current animation or restoring a history snapshot, and leave the current state unchanged on installation failure. After Trim, Split, or speed changes, call `fitClipPackageAnimationsToDuration()`: in-animation remains anchored to clip-local zero, out-animation remains anchored to the new clip end, both are capped to half the duration when enabled together, and loop animation covers the full clip. Write only the package-animation parameters, read them back, and preserve the current Timeline preview position. Do not clear transform or keyframe parameters from the shared Property Video FX.

Caption and sticker animations use dedicated in/period/out APIs. Period animation conflicts with in/out animation, so clear the other mode before applying a new mode. Caption/sticker animation duration APIs use milliseconds; timeline and clip positions use microseconds. Never pass microseconds directly to an animation-duration API.

Use [variable-speed.ts](../assets/samples/timeline/variable-speed.ts) only with a curve string produced by a documented SDK/editor curve workflow; do not invent curve syntax. Use [variable-speed-mapping.ts](../assets/samples/timeline/variable-speed-mapping.ts) to convert app-owned clip-local keyframe/effect offsets across an active curve. The SDK conversion includes clip trim-in and absolute timeline in-point, so use the sample adapters rather than passing local offsets directly.

Use microsecond timestamps in the coordinate space required by the owning object. `NvsFx` supports `setParamKeyframeAtTime()`, `setParamKeyframes()`, getters, search, and removal. First verify that the chosen parameter is keyframe-capable and use the correct typed value.

Model compound editor controls as property groups: video/caption position writes X and Y together, and scale writes X and Y together. A toggle adds or removes only its own group at the exact clip-local microsecond time. When the playhead is already on that group's keyframe, live control changes update it; otherwise they remain static edits and must not create an implicit keyframe. Always restore caption `setCurrentKeyFrameTime(-1)` in a `finally` block. Aggregate all property groups at the same absolute Timeline time into one UI marker, while retaining the group names for its count and tooltip.

When an edit changes clip coordinates, preserve only keyframes still inside the resulting half-open interval. Trim shifts retained local times by the removed head duration; Split assigns frames by the absolute split time and subtracts the right clip's new start; speed remaps local offsets through the documented curve/constant-speed conversion. Include application-owned keyframe state in undo/redo snapshots and rebuild the SDK frames before seeking back to the retained preview position.

For variable speed, use `changeCurvesVariableSpeed()` or its out-point variant only with a documented curve string. Use the conversion APIs between clip position and timeline position, and `calcDurationAfterCurvesVariableSpeed()` when duration must be predicted. Preserve audio pitch only when the relevant clip option supports it.

Image clips expose image-motion animation controls. Timeline playback-rate control uses `NvsPlaybackRateControlRegion`; it is separate from source clip speed. Sticker and caption in/period/out animation packages are covered in their feature guides.

Validate exact keyframe times, interpolated values, curve-derived duration, clip/timeline time conversion, motion enablement, and rendered frames before, at, and after each keyframe. Remove test keyframes and seek again during cleanup.

Query `--domain keyframes-and-animation`; never generate curve syntax or effect parameter names without source evidence.
