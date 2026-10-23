# Animated and custom stickers

Use [animated-sticker.ts](../assets/samples/stickers/animated-sticker.ts) for timeline-owned creation, [sticker-package-animation.ts](../assets/samples/stickers/sticker-package-animation.ts) for period versus in/out animation, and [scoped-stickers.ts](../assets/samples/stickers/scoped-stickers.ts) for clip/track ownership. A custom-image sticker still requires its matching installed sticker package ID; `customImagePath` changes the image source and does not replace the package ID.

Choose timeline-, track-, or clip-owned sticker APIs to match the requested lifetime. A packaged timeline sticker uses:

```ts
const sticker = timeline.addAnimatedSticker(
  inPointUs,
  durationUs,
  installedPackageId,
  false,
  false,
  '',
);
if (!sticker) throw new Error('Animated sticker could not be added.');
```

Install the animated-sticker package first and use the exact returned/package ID. For a custom sticker, provide the documented custom flags and an SDK-readable image path; do not combine packaged and custom inputs without evidence.

Use `NvsAnimatedSticker` methods for translation, scale, rotation, opacity, flips, volume, bounding vertices, and in/period/out animation packages. Coordinate values are canonical timeline coordinates; convert LiveWindow points first.

Validate package status, returned sticker, package ID, in/out points, transform, bounding rectangle, seek visibility, and removal through the matching owner. Missing package/license/image is a gate condition; an approved test asset may be used only as temporary validation data.
For the optional default validation-editor catalog and its test-only animated-sticker package, follow [editor-workflow-patterns.md](editor-workflow-patterns.md). This catalog is not a production content recommendation.
