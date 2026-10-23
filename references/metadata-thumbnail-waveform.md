# Metadata, thumbnails, and waveforms

Use `assets/samples/media/metadata-thumbnail-waveform.ts` for cancellable icon/waveform tasks and metadata inspection.

Use `getAVFileInfo()` to inspect SDK-readable media and verify video/audio stream information. Do not infer duration, bitrate, rotation, resolution, sample rate, channel count, or codec support from a file extension.

Thumbnail/icon APIs include `getLocalAVFileThumbnail()`, `getLocalAVFileIcon()`, cache lookup/clear, task cancellation, and `grabImageFromTimeline()`. Waveform APIs include request, cache clear, and cancellation. These operations are callback/task based; retain task IDs and cancel work when the owner unmounts or changes media.

For WebLocal media, metadata must be created by an approved parser/service and written accurately. `getAVFileInfo()` can validate what the SDK recognizes but does not make an unsupported URL/path valid.

Validate returned task ID, callback media identity, timestamp/range, pixel dimensions, waveform channel/range, cache behavior, cancellation, and teardown. Avoid retaining large frame buffers longer than necessary.

Query `--domain metadata-thumbnail-waveform` for exact callbacks, overloads, codec information, and frame-grab signatures.

For Timeline thumbnails, sample multiple source timestamps per imported video, cache them by asset, and render fixed-width tiles selected from the visible clip Trim range. Recalculate tile count after Timeline zoom or width changes; never stretch one thumbnail to fill the clip. See [editor-workflow-patterns.md](editor-workflow-patterns.md).
