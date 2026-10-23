export interface NestedTimelineClip {
  clip: NvsVideoClip;
  childTimeline: NvsTimeline;
  dispose(): Promise<void>;
}

export async function addNestedTimelineClip(
  context: NvsStreamingContext,
  parentTrack: NvsVideoTrack,
  childTimeline: NvsTimeline,
  inPointUs: number,
  trimInUs = 0,
  trimOutUs = childTimeline.getDuration(),
  ownsChildTimeline = false,
): Promise<NestedTimelineClip> {
  if (childTimeline.getDuration() <= 0) throw new Error('Child timeline is empty.');
  if (trimInUs < 0 || trimOutUs <= trimInUs || trimOutUs > childTimeline.getDuration()) {
    throw new Error('Nested timeline trim range is invalid.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const clip = parentTrack.addTimelineClip2(childTimeline, inPointUs, trimInUs, trimOutUs);
  if (!clip) throw new Error('The SDK could not add the nested timeline clip.');

  let parentClipRemoved = false;
  let childTimelineRemoved = !ownsChildTimeline;
  let disposePromise: Promise<void> | undefined;
  return {
    clip,
    childTimeline,
    dispose() {
      if (parentClipRemoved && childTimelineRemoved) return Promise.resolve();
      if (disposePromise) return disposePromise;
      disposePromise = (async () => {
        await context.streamingEngineReadyForTimelineModification();
        if (!parentClipRemoved) {
          if (!parentTrack.removeClip(clip.getIndex(), false)) {
            throw new Error('Remove the nested clip before removing its child timeline.');
          }
          parentClipRemoved = true;
        }
        if (!childTimelineRemoved) {
          if (!context.removeTimeline(childTimeline)) {
            throw new Error('The SDK could not remove the child timeline.');
          }
          childTimelineRemoved = true;
        }
      })().finally(() => {
        disposePromise = undefined;
      });
      return disposePromise;
    },
  };
}
