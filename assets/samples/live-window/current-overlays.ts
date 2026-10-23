export type TimelineOverlay =
  | NvsTimelineCaption
  | NvsTimelineCompoundCaption
  | NvsTimelineAnimatedSticker;

interface SdkVector<T> {
  size(): number;
  get(index: number): T;
}

function appendVector<T>(target: T[], vector: SdkVector<T>): void {
  for (let index = 0; index < vector.size(); index += 1) {
    target.push(vector.get(index));
  }
}

export function getOverlaysAtTimelinePosition(
  timeline: NvsTimeline,
  positionUs: number,
): TimelineOverlay[] {
  if (positionUs < 0 || positionUs >= timeline.getDuration()) return [];

  const overlays: TimelineOverlay[] = [];
  appendVector(
    overlays,
    timeline.getCaptionsByTimelinePosition(positionUs) as unknown as SdkVector<NvsTimelineCaption>,
  );
  appendVector(
    overlays,
    timeline.getCompoundCaptionsByTimelinePosition(positionUs) as unknown as SdkVector<NvsTimelineCompoundCaption>,
  );
  appendVector(
    overlays,
    timeline.getAnimatedStickersByTimelinePosition(positionUs) as unknown as SdkVector<NvsTimelineAnimatedSticker>,
  );
  return overlays.sort((left, right) => right.getZValue() - left.getZValue());
}

export function getCurrentOverlays(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
): TimelineOverlay[] {
  return getOverlaysAtTimelinePosition(
    timeline,
    context.getTimelineCurrentPosition(timeline),
  );
}
