interface PointVector {
  size(): number;
  get(index: number): NvsPointF;
}

function vectorPointsInView(
  liveWindow: NvsLiveWindow,
  vector: PointVector,
): NvsPointF[] {
  const points: NvsPointF[] = [];
  for (let index = 0; index < vector.size(); index += 1) {
    points.push(liveWindow.mapCanonicalToView(vector.get(index)));
  }
  return points;
}

export function getOverlayBoundsInView(
  liveWindow: NvsLiveWindow,
  overlay: NvsTimelineCaption | NvsTimelineAnimatedSticker | NvsTimelineCompoundCaption,
  timelinePositionUs: number,
): NvsPointF[] {
  const localTimeUs = timelinePositionUs - overlay.getInPoint();
  if (localTimeUs < 0 || timelinePositionUs >= overlay.getOutPoint()) return [];
  try {
    overlay.setCurrentKeyFrameTime(localTimeUs);
    const vertices =
      overlay instanceof NvsTimelineCompoundCaption
        ? overlay.getCompoundBoundingVertices(
            NvsCaptionTextBoundingTypeEnum.Frame,
            undefined as unknown as NvsMotionParameters,
          )
        : overlay.getBoundingRectangleVertices();
    return vectorPointsInView(liveWindow, vertices as unknown as PointVector);
  } finally {
    overlay.setCurrentKeyFrameTime(-1);
  }
}

export function isPointInsidePolygon(point: NvsPointF, polygon: NvsPointF[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function hitTestOverlay(
  liveWindow: NvsLiveWindow,
  overlay: NvsTimelineCaption | NvsTimelineAnimatedSticker | NvsTimelineCompoundCaption,
  viewPoint: NvsPointF,
  timelinePositionUs: number,
): boolean {
  return isPointInsidePolygon(
    viewPoint,
    getOverlayBoundsInView(liveWindow, overlay, timelinePositionUs),
  );
}
