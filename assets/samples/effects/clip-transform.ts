export interface ClipTransform {
  translationX?: number;
  translationY?: number;
  scaleX?: number;
  scaleY?: number;
  rotationDegrees?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  fillMode?: 'AspectFit' | 'PanAndScan' | 'Stretch';
}

export async function setClipTransform(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  transform: ClipTransform,
): Promise<NvsVideoFx> {
  await context.streamingEngineReadyForTimelineModification();
  clip.enablePropertyVideoFx(true);
  const property = clip.getPropertyVideoFx();
  if (!property) throw new Error('The SDK did not expose the clip property effect.');
  if (transform.translationX !== undefined) property.setFloatVal('Trans X', transform.translationX);
  if (transform.translationY !== undefined) property.setFloatVal('Trans Y', transform.translationY);
  if (transform.scaleX !== undefined) property.setFloatVal('Scale X', transform.scaleX);
  if (transform.scaleY !== undefined) property.setFloatVal('Scale Y', transform.scaleY);
  if (transform.rotationDegrees !== undefined) property.setFloatVal('Rotation', transform.rotationDegrees);
  if (transform.anchorX !== undefined) property.setFloatVal('Anchor X', transform.anchorX);
  if (transform.anchorY !== undefined) property.setFloatVal('Anchor Y', transform.anchorY);
  if (transform.opacity !== undefined) property.setFloatVal('Opacity', transform.opacity);
  if (transform.fillMode !== undefined) {
    property.setMenuVal('Fill Mode', transform.fillMode);
    property.setFloatVal('Scan Value', transform.fillMode === 'PanAndScan' ? 1 : 0);
  }
  return property;
}
