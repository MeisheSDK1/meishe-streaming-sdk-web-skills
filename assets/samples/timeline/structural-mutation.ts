export async function runTimelineStructuralMutation<T>(
  context: NvsStreamingContext,
  mutate: () => T | Promise<T>,
): Promise<T> {
  // Source deletion/split workflows wait for an outstanding seek before changing structure.
  await context.lastSeekingFinished();
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  return mutate();
}
