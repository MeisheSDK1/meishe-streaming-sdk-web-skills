import { mutateAndPreservePreview } from './preserve-preview-position';

export async function trimMediaClipEdgeAndRefresh(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  track: NvsVideoTrack | NvsAudioTrack,
  clip: NvsClip,
  edge: 'in' | 'out',
  requestedPositionUs: number,
  frameDurationUs: number,
  synchronizeDuration: () => void | Promise<void>,
): Promise<number> {
  const clipIndex = clip.getIndex();
  if (
    !Number.isFinite(requestedPositionUs) ||
    frameDurationUs <= 0 ||
    clipIndex < 0 ||
    track.getClipByIndex(clipIndex)?.getInternalObject() !== clip.getInternalObject()
  ) {
    throw new Error('Provide a finite Trim position, positive frame duration, and a clip owned by the track.');
  }

  const previousClip = clipIndex > 0 ? track.getClipByIndex(clipIndex - 1) : null;
  const nextClip = clipIndex + 1 < track.getClipCount() ? track.getClipByIndex(clipIndex + 1) : null;
  const targetUs = edge === 'in'
    ? Math.min(Math.max(requestedPositionUs, previousClip?.getOutPoint() ?? 0), clip.getOutPoint() - frameDurationUs)
    : Math.max(Math.min(requestedPositionUs, nextClip?.getInPoint() ?? Number.POSITIVE_INFINITY), clip.getInPoint() + frameDurationUs);
  const previousEdgeUs = edge === 'in' ? clip.getInPoint() : clip.getOutPoint();
  return mutateAndPreservePreview(context, timeline, async () => {
    const actualUs = edge === 'in'
      ? track.changeInPoint(clipIndex, targetUs)
      : track.changeOutPoint(clipIndex, targetUs);
    if (
      actualUs < 0 ||
      clip.getOutPoint() - clip.getInPoint() < frameDurationUs ||
      (previousClip && clip.getInPoint() < previousClip.getOutPoint()) ||
      (nextClip && clip.getOutPoint() > nextClip.getInPoint())
    ) {
      if (edge === 'in') track.changeInPoint(clipIndex, previousEdgeUs);
      else track.changeOutPoint(clipIndex, previousEdgeUs);
      throw new Error('The SDK rejected the Trim or returned an overlapping same-track range.');
    }
    await synchronizeDuration();
    return actualUs;
  });
}
