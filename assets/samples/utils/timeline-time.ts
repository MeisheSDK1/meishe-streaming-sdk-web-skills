export const MICROSECONDS_PER_SECOND = 1_000_000;

export function secondsToTimelineUs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Timeline seconds must be a finite non-negative number.');
  }
  return Math.round(seconds * MICROSECONDS_PER_SECOND);
}

export function timelineUsToSeconds(microseconds: number): number {
  if (!Number.isFinite(microseconds) || microseconds < 0) {
    throw new Error('Timeline microseconds must be a finite non-negative number.');
  }
  return microseconds / MICROSECONDS_PER_SECOND;
}

export function clampSeekPositionUs(timeline: NvsTimeline, positionUs: number): number {
  const durationUs = timeline.getDuration();
  if (durationUs <= 0) throw new Error('Cannot seek an empty timeline.');
  if (!Number.isFinite(positionUs)) throw new Error('Seek position must be finite.');
  return Math.min(Math.max(0, Math.round(positionUs)), durationUs - 1);
}
