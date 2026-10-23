export interface OverlayGesture {
  /** Canonical-coordinate translation delta. */
  translationOffset?: NvsPointF;
  /** Multipliers applied to the current scale, not absolute scale values. */
  scaleMultiplierX?: number;
  scaleMultiplierY?: number;
  /** Incremental rotation in degrees. */
  rotationDeltaDegrees?: number;
}

type CaptionOverlay = NvsCaption | NvsCompoundCaption;

interface OwnerTimedOverlay {
  getInPoint(): number;
  getOutPoint(): number;
  setCurrentKeyFrameTime(time: number): void;
}

function requireGesture(gesture: OverlayGesture): void {
  const scaleX = gesture.scaleMultiplierX ?? 1;
  const scaleY = gesture.scaleMultiplierY ?? 1;
  if (scaleX <= 0 || scaleY <= 0) throw new Error('Overlay scale multipliers must be positive.');
  const numbers = [
    gesture.translationOffset?.x,
    gesture.translationOffset?.y,
    gesture.rotationDeltaDegrees,
    scaleX,
    scaleY,
  ].filter((value): value is number => value !== undefined);
  if (numbers.some((value) => !Number.isFinite(value))) {
    throw new Error('Overlay gesture values must be finite numbers.');
  }
}

function setOwnerLocalKeyframeTime(
  overlay: OwnerTimedOverlay,
  ownerPositionUs: number,
  writeKeyframe: boolean,
): void {
  if (!writeKeyframe) {
    overlay.setCurrentKeyFrameTime(-1);
    return;
  }
  const localTimeUs = ownerPositionUs - overlay.getInPoint();
  if (localTimeUs < 0 || ownerPositionUs >= overlay.getOutPoint()) {
    throw new Error('Owner position must be inside the overlay when writing transform keyframes.');
  }
  overlay.setCurrentKeyFrameTime(localTimeUs);
}

export function viewDragToCanonicalOffset(
  liveWindow: NvsLiveWindow,
  startView: NvsPointF,
  currentView: NvsPointF,
): NvsPointF {
  const start = liveWindow.mapViewToCanonical(startView);
  const current = liveWindow.mapViewToCanonical(currentView);
  return new NvsPointF(current.x - start.x, current.y - start.y);
}

export async function applyCaptionOverlayGesture(
  context: NvsStreamingContext,
  caption: CaptionOverlay & OwnerTimedOverlay,
  ownerPositionUs: number,
  gesture: OverlayGesture,
  writeKeyframe = false,
): Promise<void> {
  requireGesture(gesture);
  await context.streamingEngineReadyForTimelineModification();
  try {
    setOwnerLocalKeyframeTime(caption, ownerPositionUs, writeKeyframe);
    if (gesture.translationOffset) caption.translateCaption(gesture.translationOffset);
    if (gesture.scaleMultiplierX !== undefined) {
      caption.setScaleX(caption.getScaleX() * gesture.scaleMultiplierX);
    }
    if (gesture.scaleMultiplierY !== undefined) {
      caption.setScaleY(caption.getScaleY() * gesture.scaleMultiplierY);
    }
    if (gesture.rotationDeltaDegrees !== undefined) {
      caption.rotateCaption2(gesture.rotationDeltaDegrees);
    }
  } finally {
    caption.setCurrentKeyFrameTime(-1);
  }
}

export async function applyStickerOverlayGesture(
  context: NvsStreamingContext,
  sticker: NvsAnimatedSticker & OwnerTimedOverlay,
  ownerPositionUs: number,
  gesture: OverlayGesture,
  rotationAnchorCanonical: NvsPointF,
  writeKeyframe = false,
): Promise<void> {
  requireGesture(gesture);
  await context.streamingEngineReadyForTimelineModification();
  try {
    setOwnerLocalKeyframeTime(sticker, ownerPositionUs, writeKeyframe);
    if (gesture.translationOffset) sticker.translateAnimatedSticker(gesture.translationOffset);
    if (gesture.scaleMultiplierX !== undefined) {
      sticker.setSeperatedScaleX(sticker.getSeperatedScaleX() * gesture.scaleMultiplierX);
    }
    if (gesture.scaleMultiplierY !== undefined) {
      sticker.setSeperatedScaleY(sticker.getSeperatedScaleY() * gesture.scaleMultiplierY);
    }
    if (gesture.rotationDeltaDegrees !== undefined) {
      sticker.rotateAnimatedSticker(gesture.rotationDeltaDegrees, rotationAnchorCanonical);
    }
  } finally {
    sticker.setCurrentKeyFrameTime(-1);
  }
}
