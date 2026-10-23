# Sample index

Use these code samples as low-freedom source material, not as a project template. Most are framework-neutral TypeScript; the UI group identifies its framework explicitly. Read only the requested group, remove unrelated code, and preserve the target project's conventions.

## Default editor UI

- [React five-region default editor](../assets/samples/ui/DefaultEditorUi.tsx), [canonical editor CSS](../assets/samples/ui/default-editor-ui.css), and [framework-neutral layout, ruler, seek, thumbnail, and timecode geometry](../assets/samples/ui/default-editor-layout.ts)
- Use this group only after [default-editor-ui.md](default-editor-ui.md) selects the default validation UI. `DefaultEditorUi` is the only layout sample. Keep measurements and mapping functions together, and adapt component syntax without inventing replacement geometry or alternate layouts.

## Core and timeline

For the bounded local-video workflow, start with [simple WebLocal preview](simple-weblocal-preview.md); it selects the necessary samples below without turning this index into a project template.

### Core

- [project-load SDK singleton](../assets/samples/core/sdk-startup.ts), [empty/application-XML/SDK-native project branches](../assets/samples/core/project-loading.ts), [pre-WASM LocalStorage environment](../assets/samples/core/runtime-environment.ts), [static/runtime SDK version report](../assets/samples/core/sdk-version.ts)
- [SDK loader/context readiness](../assets/samples/core/sdk-loader.ts), [browser audio resume](../assets/samples/core/resume-audio-context.ts), [feature authorization gate](../assets/samples/core/capability-gate.ts)
- [end-to-end project loader](../assets/samples/core/editor-bootstrap.ts), [Timeline/LiveWindow session](../assets/samples/core/editor-session.ts)

### Timeline

- [track lifecycle](../assets/samples/timeline/track-management.ts), [track/clip edits](../assets/samples/timeline/track-clip-operations.ts), [collision-safe editor media Trim and refresh](../assets/samples/timeline/editor-media-trim.ts), [seek-safe structural mutations](../assets/samples/timeline/structural-mutation.ts)
- [highest-only editor track/base policy](../assets/samples/timeline/editor-track-policy.ts), [preserve preview position](../assets/samples/timeline/preserve-preview-position.ts), [timed overlay/effect ranges and transactional Split adapter](../assets/samples/timeline/timed-object-operations.ts)
- [timeline settings/VU](../assets/samples/timeline/timeline-settings.ts), [existing timeline inspection](../assets/samples/timeline/timeline-snapshot.ts), [playback/rate control](../assets/samples/timeline/playback-controller.ts)
- [variable speed](../assets/samples/timeline/variable-speed.ts), [variable-speed coordinate mapping](../assets/samples/timeline/variable-speed-mapping.ts), [nested timeline](../assets/samples/timeline/nested-timeline.ts)

### LiveWindow

- [connection/cleanup](../assets/samples/live-window/live-window-controller.ts), [canvas size/DPR](../assets/samples/live-window/canvas-resize.ts), [resizable editor preview/timecode](../assets/samples/live-window/resizable-editor-preview.ts)
- [coordinate conversion/pixel sampling](../assets/samples/live-window/coordinate-conversion.ts), [timeline-owned current overlays](../assets/samples/live-window/current-overlays.ts), [overlay bounds/hit testing](../assets/samples/live-window/overlay-hit-test.ts)
- [caption/sticker transforms](../assets/samples/live-window/overlay-transform.ts), [video transforms](../assets/samples/live-window/video-transform.ts)

### Utilities

- [SDK vector conversion](../assets/samples/utils/sdk-vector.ts), [SDK color conversion](../assets/samples/utils/sdk-color.ts), [pixel-aspect-aware media size](../assets/samples/utils/media-display-size.ts)
- [anchor compensation](../assets/samples/utils/anchor-compensation.ts), [timeline time conversion](../assets/samples/utils/timeline-time.ts), [single-flight FIFO queue](../assets/samples/utils/single-flight-queue.ts)

## Media and editing

### Media

- [SDK FS roots/path validation](../assets/samples/media/sdk-fs-paths.ts), [bounded SDK FS resources](../assets/samples/media/media-fs.ts), [Meishe-transcoded M3U8 lifecycle](../assets/samples/media/transcoded-m3u8-media.ts), [local-file/original-URL video WebLocal lifecycle](../assets/samples/media/web-local-media.ts)
- [metadata/icon/waveform](../assets/samples/media/metadata-thumbnail-waveform.ts), [zoom-aware Timeline thumbnails](../assets/samples/media/timeline-thumbnails.ts), [replace clip source](../assets/samples/media/replace-clip-source.ts)

### Video

- [trim/split/move](../assets/samples/video/clip-structure.ts), [still-image left extension](../assets/samples/video/still-image-left-trim.ts), [whole-clip freeze property](../assets/samples/video/clip-properties.ts), [inserted freeze-frame segment](../assets/samples/video/insert-freeze-frame.ts)
- [still image/raw-source presentation](../assets/samples/video/still-image-motion.ts), [in/loop/out package animation](../assets/samples/video/clip-animation.ts), [separate alpha](../assets/samples/video/separate-alpha.ts), [watermark](../assets/samples/video/watermark.ts)

### Audio

- [audio editing](../assets/samples/audio/audio-editing.ts), [managed audio FX state](../assets/samples/audio/audio-fx-management.ts), [microphone recording to SDK FS](../assets/samples/audio/microphone-recording.ts)

### Captions

- [basic/style](../assets/samples/captions/basic-caption.ts), [basic timeline lyrics flag](../assets/samples/captions/lyrics-caption.ts), [formatting/speed](../assets/samples/captions/caption-formatting.ts), [anchor preservation](../assets/samples/captions/caption-anchor.ts)
- [clip/track captions](../assets/samples/captions/scoped-captions.ts), [transform keyframes](../assets/samples/captions/caption-keyframes.ts), [package animation](../assets/samples/captions/caption-package-animation.ts)
- [modular](../assets/samples/captions/modular-caption.ts), [modular snapshot/history restore](../assets/samples/captions/modular-caption-history.ts), [compound](../assets/samples/captions/compound-caption.ts), [time-follow/per-word lyrics](../assets/samples/captions/time-follow-caption.ts)
- [SRT](../assets/samples/captions/srt-captions.ts), [font registration](../assets/samples/captions/font-registration.ts), [rich-text spans](../assets/samples/captions/rich-text-caption.ts)

### Stickers

- [timeline animated/custom sticker](../assets/samples/stickers/animated-sticker.ts), [package animation](../assets/samples/stickers/sticker-package-animation.ts), [clip/track stickers](../assets/samples/stickers/scoped-stickers.ts)

## Effects, packages, and persistence

### Effects

- [timeline/clip effects](../assets/samples/effects/video-effects.ts), [validation-editor filter/effect lanes, Trim, delete, and refresh](../assets/samples/effects/timeline-effect-workflow.ts), [track effects](../assets/samples/effects/track-video-effects.ts), [video transition](../assets/samples/effects/video-transition.ts)
- [effect keyframes](../assets/samples/effects/parameter-keyframes.ts), [grouped clip-transform keyframes](../assets/samples/effects/clip-transform-keyframes.ts), [keyframe inspection](../assets/samples/effects/keyframe-inspection.ts), [manual-adjustment schema](../assets/samples/effects/adjustment-schema.ts)
- [video Raw FX adjustment](../assets/samples/effects/video-adjustment.ts), [timeline adjustment stack](../assets/samples/effects/timeline-adjustment.ts), [editor adjustment lanes and atomic commands](../assets/samples/effects/timeline-adjustment-workflow.ts), [clip transform/fill mode](../assets/samples/effects/clip-transform.ts)
- [background fill](../assets/samples/effects/clip-background.ts), [LUT](../assets/samples/effects/lut-filter.ts), [automatic tone](../assets/samples/effects/auto-tone.ts), [crop](../assets/samples/effects/crop.ts)
- [verified Mosaic video-clip shade mask and view-rectangle adapter](../assets/samples/effects/video-mask.ts), [timeline effect/caption mask](../assets/samples/effects/timeline-mask.ts), [regional Region I/O and explicit Mask Generator exception](../assets/samples/effects/mask-region-io.ts), [transactional text-mask effect](../assets/samples/effects/text-mask.ts)

### Advanced

- [shared human-detection lifecycle](../assets/samples/advanced/human-detection.ts), [background-segmentation Object Stroke keyer](../assets/samples/advanced/human-segmentation-keyer.ts), [AR Scene beauty/makeup](../assets/samples/advanced/ar-scene-beauty.ts), [transactional Master Keyer and untreated-frame color picker](../assets/samples/advanced/master-keyer.ts), [particle effect](../assets/samples/advanced/particle-effect.ts)

### Packages

- [install lifecycle](../assets/samples/packages/asset-package.ts), [inspect/upgrade/uninstall](../assets/samples/packages/asset-package-maintenance.ts)

### Templates

- [install/load package](../assets/samples/templates/template-package-loading.ts), [replace footage/create timeline](../assets/samples/templates/template-timeline.ts), [add template as nested timeline](../assets/samples/templates/template-nested-timeline.ts)
- [load a template-authoring project](../assets/samples/templates/template-authoring-project-load.ts), [authoring timing/footage/effect attachments and XML](../assets/samples/templates/template-authoring.ts), [inspect/replace text](../assets/samples/templates/template-text-replacement.ts)

### Persistence

- [SDK project XML/load](../assets/samples/persistence/project-persistence.ts), [package generation](../assets/samples/persistence/package-generation.ts), [application-owned XML stream codec](../assets/samples/persistence/application-project-xml.ts), [minimal XML round trip](../assets/samples/persistence/application-project-xml-example.ts)
