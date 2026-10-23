type VariableSpeedClip = NvsVideoClip | NvsAudioClip;

function requireVariableSpeedCurve(clip: VariableSpeedClip): void {
  if (!clip.getClipVariableSpeedCurvesString()) {
    throw new Error('Clip/timeline curve mapping requires an active documented variable-speed curve.');
  }
}

/** Convert a clip-local timeline offset into an unwarped source-local offset. */
export function variableSpeedTimelineLocalToSourceLocal(
  clip: VariableSpeedClip,
  timelineLocalUs: number,
): number {
  requireVariableSpeedCurve(clip);
  const durationUs = clip.getOutPoint() - clip.getInPoint();
  if (!Number.isFinite(timelineLocalUs) || timelineLocalUs < 0 || timelineLocalUs > durationUs) {
    throw new Error('timelineLocalUs must be inside the clip timeline range.');
  }
  // The SDK returns a source position including trim-in; normalize it for app-owned local data.
  return clip.getClipPosByTimelinePosCurvesVariableSpeed(clip.getInPoint() + timelineLocalUs) - clip.getTrimIn();
}

/** Convert an unwarped source-local offset into a clip-local timeline offset. */
export function variableSpeedSourceLocalToTimelineLocal(
  clip: VariableSpeedClip,
  sourceLocalUs: number,
): number {
  requireVariableSpeedCurve(clip);
  const sourceDurationUs = clip.getTrimOut() - clip.getTrimIn();
  if (!Number.isFinite(sourceLocalUs) || sourceLocalUs < 0 || sourceLocalUs > sourceDurationUs) {
    throw new Error('sourceLocalUs must be inside the clip source trim range.');
  }
  return clip.getTimelinePosByClipPosCurvesVariableSpeed(clip.getTrimIn() + sourceLocalUs) - clip.getInPoint();
}

export function mapVariableSpeedSourceRangeToTimeline(
  clip: VariableSpeedClip,
  sourceInUs: number,
  sourceOutUs: number,
): { inPointUs: number; outPointUs: number; durationUs: number } {
  if (sourceOutUs <= sourceInUs) throw new Error('Source range must have positive duration.');
  const inPointUs = variableSpeedSourceLocalToTimelineLocal(clip, sourceInUs);
  const outPointUs = variableSpeedSourceLocalToTimelineLocal(clip, sourceOutUs);
  if (outPointUs <= inPointUs) throw new Error('The variable-speed mapping produced an invalid timeline range.');
  return { inPointUs, outPointUs, durationUs: outPointUs - inPointUs };
}
