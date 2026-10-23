export async function disableStillImageMotion(
  context: NvsStreamingContext,
  imageClip: NvsVideoClip,
): Promise<void> {
  await context.streamingEngineReadyForTimelineModification();
  if (imageClip.isRawSourceModeEnabled()) {
    throw new Error('Disable raw-source mode explicitly before configuring still-image motion.');
  }
  imageClip.setImageMotionMode(0);
  imageClip.setImageMotionAnimationEnabled(false);
}

export async function setRawSourcePresentation(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  enabled: boolean,
): Promise<void> {
  if (enabled && clip.isPropertyVideoFxEnabled()) {
    throw new Error('Raw-source mode conflicts with related property-effect presentation parameters.');
  }
  await context.streamingEngineReadyForTimelineModification();
  clip.enableRawSourceMode(enabled);
}

export async function setReferenceImagePresentation(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  width: number,
  height: number,
  fillMode: number,
): Promise<void> {
  if (width < 0 || height < 0) throw new Error('Reference image size cannot be negative.');
  await context.streamingEngineReadyForTimelineModification();
  clip.setRefImageSize(width, height);
  clip.setRefImageFillMode(fillMode);
}
