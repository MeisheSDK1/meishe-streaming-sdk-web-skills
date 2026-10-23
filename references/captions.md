# Captions and compound captions

## Optional font warning and fallback

The SDK does not require an explicitly installed font to add a timeline, track, or clip caption. `addCaption()` may succeed without one, but CJK text can render as mojibake or missing glyphs. Treat this as a non-blocking rendering risk, not a prerequisite or dependency gate.

During caption integration, tell the user about that risk. If they want to install a font, resolve the optional source in this order:

1. Use a user-provided `.otf`, `.ttf`, or `.ttc` file.
2. Use a user-provided online font URL.
3. If neither was provided, tell the user that the approved fallback is available and may be used: `https://alieasset.meishesdk.com/font/NotoSansCJKsc-Regular.otf`.

When the optional font path is chosen, require a successful CORS response for a URL source. Start it only after the user chooses font installation or accepts the disclosed fallback; never await an optional remote font during editor initialization or before enabling caption creation. Pass the selected `File` or URL explicitly to `installCaptionFont()`; the helper intentionally has no default source. Bound URL fetch time as well as byte size, expose cancellation/retry, and let caption editing continue without an explicit font after a timeout or failure. Download the bounded font bytes, write them below `/font` with the original supported extension, call `context.registerFontByFilePath()`, and require a non-empty returned family. Apply the installed path with `caption.setFontByFilePath()`. Keep the SDK FS file alive while any caption or registered font uses it; delete owned font files only after the owning Timeline is removed. Do not silently fall back after a user-provided font fails—report that failure and let the user replace it or continue without an explicit font.

Use [font-registration.ts](../assets/samples/captions/font-registration.ts) for this flow. The fallback URL is approved for caption integration, not a general-purpose test resource or permission to substitute other external assets.

Use the caption group in [sample-index.md](sample-index.md) for ownership, formatting, modular/compound/time-follow captions, SRT import, keyframes, package animation, fonts, and rich-text spans. SRT cues may overlap. Rich-text span values are discriminated by type, and renderer spans/time-follow renderers require a Ready `CaptionRenderer` package. Use [caption-package-animation.ts](../assets/samples/captions/caption-package-animation.ts) for modular period versus in/out animation; do not infer that transform keyframes and animation packages are interchangeable.

Choose the owner deliberately: timeline, track, or clip captions have distinct classes and lifetimes. A basic timeline caption is created with:

```ts
const caption = timeline.addCaption(text, inPointUs, durationUs, '', false);
if (!caption) throw new Error('Caption could not be added.');
```

An empty style package ID requests the non-packaged path documented by the SDK. Packaged caption styles, renderers, contexts, and modular animations require their packages and applicable licenses to be installed first.

Treat an editor lane or track label as application metadata unless the requirement explicitly binds the caption lifetime to an SDK track or clip. In particular, a normal lyrics caption uses the same SDK owner and creation API as a normal timeline caption: call `NvsTimeline.addCaption()`, then call `caption.setIsLyrics(true)` and verify `caption.isLyrics()`. `setIsLyrics(true)` changes the caption's lyrics semantics; it does not convert the object to `NvsTrackCaption`, create an SDK video track, or change its removal API. A single lyrics lane, bottom-row placement, overlap policy, and per-lane selection are editor-model/UI responsibilities. Do not use `NvsVideoTrack.addCaption()` merely because the UI calls the grouping a lyrics track. Use [lyrics-caption.ts](../assets/samples/captions/lyrics-caption.ts) for the basic timeline-owned recipe.

Persist the lyrics flag in editor snapshots. Split, undo, redo, paste, and project restoration recreate each basic lyrics object through `NvsTimeline.addCaption()` and reapply `setIsLyrics(true)` before restoring formatting, transforms, or keyframes. Read `isLyrics()` when importing or rebuilding editor lanes so lyrics captions do not enter normal caption-lane allocation. Remove basic lyrics with `NvsTimeline.removeCaption()`. Use `addTimeFollowCaption()` only when the requirement includes per-word timing/highlighting or another time-follow capability; the word "lyrics" alone does not select the time-follow API.

Keep normal and modular captions as distinct editor object types. Create a normal caption with `addCaption()` and a modular caption with `addModularCaption()`; never recreate one through the other API as an implicit conversion. Gate every renderer/context action with `caption.isModular()`. `CaptionRenderer` and `CaptionContext` packages are modular-caption materials and must remain disabled for normal captions; a packaged `CaptionStyle` is not a renderer substitute. After applying a modular package, require the boolean result and verify `getModularCaptionRendererPackageId()` or `getModularCaptionContextPackageId()` matches the requested ID.

Style text with verified `NvsCaption` setters for font family, size, color, outline, shadow, background, alignment, translation, scale, and rotation. Treat `setDrawOutline()` and `setDrawShadow()` as independent on/off state; changing width, color, offset, or feather must not silently toggle them. Background visibility is encoded by the alpha of `setBackgroundColor()` because this surface has no separate draw-background switch; preserve RGB while setting alpha to zero when disabling it. Read the matching getters when selecting or snapshotting a caption instead of treating panel state as authoritative.

For Split, undo, redo, or project-level snapshot restoration, persist whether the object is modular plus its context, renderer, animation packages/durations, base formatting, transforms, and caption-local keyframes. Recreate modular snapshots only with `addModularCaption()`, require referenced packages to be installed and `Ready`, apply packages first, then restore editor-owned formatting and local-time keyframes. Split must create two captions of the same type and filter/rebase keyframes into each child's local time range. Preserve the SDK playhead before the transaction and seek after the full restore. Use [modular-caption-history.ts](../assets/samples/captions/modular-caption-history.ts) for the restore ordering and the generic transactional Split adapter for atomic rollback.

Use `NvsCaptionSpan`/compound-caption APIs only when per-range or compound behavior is requested. Do not block caption creation when no explicit font is installed; surface the rendering warning and optional fallback instead.

Validate returned object, in/out points, text, bounding vertices, style package ID, glyph rendering, and seek within/outside the caption interval. When the optional font path is used, also validate the registered font family/path and CJK glyph rendering. Remove through the corresponding timeline/track/clip removal API. Query `--domain captions` for all basic, modular, time-follow, and compound APIs.
For the optional default validation-editor catalog and its test-only style package, follow [editor-workflow-patterns.md](editor-workflow-patterns.md). This catalog is not a production content recommendation.
