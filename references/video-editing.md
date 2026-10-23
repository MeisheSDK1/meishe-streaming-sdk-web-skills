# Video and image editing

Use [clip-structure.ts](../assets/samples/video/clip-structure.ts) and [track-clip-operations.ts](../assets/samples/timeline/track-clip-operations.ts) for trim/split/move sequences, [variable-speed.ts](../assets/samples/timeline/variable-speed.ts) for collision-safe speed changes, [still-image-left-trim.ts](../assets/samples/video/still-image-left-trim.ts) when a still image must extend left, and the other routed video/effect samples in [sample-index.md](sample-index.md) for properties, presentation, animation, alpha, watermarks, transforms, adjustments, crop, and masks. Reverse-media generation belongs to the customer's backend/media service and has no Skill sample.

Add video/image media through `NvsVideoTrack` and retain the returned `NvsVideoClip`. Use trim, speed, reverse, rotation, pan/scan, ROI, wrap, source-mode, and audio-stream methods only after querying their exact contract. A still image may require image-motion settings rather than video-speed APIs.

Await `streamingEngineReadyForTimelineModification()` before trim, split, move, freeze-frame, or source-presentation changes. SDK trim methods may clamp the requested value; store their returned actual values. Split points are timeline positions and must be strictly inside the clip. Freeze-frame positions use source trim coordinates.

Clarify freeze-frame product semantics before implementation. A whole-clip freeze only calls `enableClipFreezeFrame()` and `setClipFreezeFrameTrimPosition()` on the selected clip. An inserted freeze-frame segment is a structural edit: decide its duration and whether later content shifts on only the selected video track or across every Timeline lane. Use [insert-freeze-frame.ts](../assets/samples/video/insert-freeze-frame.ts) for the selected-track variant. Map a constant-speed playhead with Trim-in plus Timeline-local offset times speed; when a documented curve is active, use `getClipPosByTimelinePosCurvesVariableSpeed()` instead. Split at the playhead, shift later same-track clips from right to left, create a one-frame source range, enable freeze frame, extend its Timeline out-point, disable its audio streams, and verify every returned position and state. Do not silently turn this into a global ripple edit.

Treat inserted freeze frame as one atomic editor command. Capture the full application/SDK history state before mutation, preserve stable IDs and selection separately from SDK indexes, copy the source frame's supported transform/effect state into the created clips, synchronize duration, and restore the entire snapshot if Split, move, creation, property restoration, or seek fails. Persist at least the freeze enabled state, freeze Trim position, and muted-audio invariant so undo/redo can rebuild the one-frame source clip before extending its out-point. Repeated-click behavior and whether the created segment remains selected are product decisions; do not infer them from the SDK API.

For constant or curve speed, derive the new duration first, align the resulting out-point to the Timeline frame duration, reject collisions with the next clip, then call the matching SDK out-point variant while the engine is stopped. Verify the actual clip out-point and remap application-owned local state afterward. Clip speed changes clip length; it must not change the Timeline ruler scale, zoom, or the application-owned seek axis.

`enableRawSourceMode(true)` disables image-motion/pan-scan behavior and conflicts with related property-effect parameters according to the 3.16.0 declaration. Do not combine those modes. `NvsVideoClipExtraRotationEnum` and `NvsBlendingMode` values are SDK enums; do not pass UI labels or degree values directly.

Treat raw-source mode as dedicated clip state. Check it with `isRawSourceModeEnabled()` and use `isPropertyVideoFxEnabled()` when testing the conflicting property-effect mode; the existence of a property-effect object alone is not evidence that the property effect is enabled.

The 3.16.0 API catalog still documents `setPlayInReverse()` for completeness, but this Skill does not provide a reverse-playback recipe. Treat reverse-media generation as a customer backend/media-service dependency and do not substitute the SDK flag for that workflow.

For clip properties, prefer the SDK's property video effect when the documented parameter lives there: call `enablePropertyVideoFx(true)`, obtain `getPropertyVideoFx()`, and set a typed parameter only with a verified effect parameter name and value range. Do not translate product labels into effect parameter strings by guesswork.

Built-in clip effects use `appendBuiltinFx(name)`; packaged clip effects use `appendPackagedFx(packageId)` after package installation. Timeline watermarks use `addWatermark()` or `addWatermark2()` and have separate opacity/removal APIs.

Validate source path, trim range, in/out points, transform result, effect count, and a rendered seek. Check boolean/object return values. For unsupported source formats, stop and request the customer's transcoded or correctly described media instead of silently substituting production data.

Query the complete surface with `node <skill>/scripts/query-api.mjs --domain video-editing`.
