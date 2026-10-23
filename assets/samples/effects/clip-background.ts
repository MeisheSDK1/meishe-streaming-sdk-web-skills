export type ClipBackground =
  | { mode: 'color'; color: NvsColor }
  | { mode: 'image'; imagePath: string }
  | { mode: 'blur'; radius: number };

export async function setClipBackground(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  background: ClipBackground,
): Promise<NvsVideoFx> {
  if (background.mode === 'image' && (!background.imagePath || !FS.analyzePath(background.imagePath).exists)) {
    throw new Error(`[missing-external] Provide the background image in SDK FS: ${background.imagePath || '(missing path)'}`);
  }
  if (background.mode === 'blur' && background.radius < 0) {
    throw new Error('Background blur radius cannot be negative.');
  }
  await context.streamingEngineReadyForTimelineModification();
  clip.enablePropertyVideoFx(true);
  const property = clip.getPropertyVideoFx();
  if (!property) throw new Error('The SDK did not expose the clip property effect.');
  if (background.mode === 'color') {
    property.setMenuVal('Background Mode', 'Color Solid');
    property.setColorVal('Background Color', background.color);
    property.setStringVal('Background Image', '');
    property.setFloatVal('Background Blur Radius', 0);
  } else if (background.mode === 'image') {
    property.setMenuVal('Background Mode', 'Image File');
    property.setStringVal('Background Image', background.imagePath);
    property.setColorVal('Background Color', new NvsColor(0, 0, 0, 0));
    property.setFloatVal('Background Blur Radius', 0);
  } else {
    property.setMenuVal('Background Mode', 'Blur');
    property.setFloatVal('Background Blur Radius', background.radius);
    property.setColorVal('Background Color', new NvsColor(0, 0, 0, 0));
    property.setStringVal('Background Image', '');
  }
  return property;
}
