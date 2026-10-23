export async function mutateAndPreservePreview<T>(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  mutate: () => T | Promise<T>,
): Promise<T> {
  const previousPosition = context.getTimelineCurrentPosition(timeline);
  await context.lastSeekingFinished();
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  let result!: T;
  let mutationError: unknown;
  try {
    result = await mutate();
  } catch (error) {
    mutationError = error;
  }
  const duration = timeline.getDuration();
  if (duration > 0) {
    const target = Math.min(Math.max(0, previousPosition), duration - 1);
    if (!context.seekTimeline(timeline, target, NvsVideoPreviewSizeModeEnum.LiveWindowSize, 0)) {
      if (mutationError) throw mutationError;
      throw new Error('Could not refresh the preview at its previous position.');
    }
  }
  if (mutationError) throw mutationError;
  return result;
}
