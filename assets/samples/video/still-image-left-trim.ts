export interface RestorableStillState {
  volume: { leftVolume: number; rightVolume: number };
  restore(replacement: NvsVideoClip): void;
}

export async function extendStillImageLeft(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  clip: NvsVideoClip,
  sourcePath: string,
  newInPoint: number,
  state: RestorableStillState,
): Promise<NvsVideoClip> {
  const oldOutPoint = clip.getOutPoint();
  if (newInPoint < 0 || newInPoint >= oldOutPoint) throw new Error('The new still-image in-point is invalid.');
  if (newInPoint >= clip.getInPoint()) {
    if (track.changeInPoint(clip.getIndex(), newInPoint) < 0) throw new Error('Could not trim the still-image in-point.');
    return track.getClipByTimelinePosition(newInPoint);
  }

  await context.streamingEngineReadyForTimelineModification();
  if (!track.removeClip(clip.getIndex(), true)) throw new Error('Could not remove the old still-image clip.');
  const replacement = track.addClip2(sourcePath, newInPoint, 0, oldOutPoint - newInPoint);
  if (!replacement) throw new Error('Could not recreate the extended still-image clip.');
  replacement.setVolumeGain(state.volume.leftVolume, state.volume.rightVolume);
  state.restore(replacement);
  return replacement;
}
