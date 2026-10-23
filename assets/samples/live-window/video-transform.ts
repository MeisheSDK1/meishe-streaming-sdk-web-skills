import { viewDragToCanonicalOffset } from './overlay-transform';

export interface VideoTransformGesture {
  translationOffset?: NvsPointF;
  scaleMultiplierX?: number;
  scaleMultiplierY?: number;
  rotationDeltaDegrees?: number;
  horizontalFlip?: boolean;
  verticalFlip?: boolean;
}

export function viewDragToVideoTranslation(
  liveWindow: NvsLiveWindow,
  startView: NvsPointF,
  currentView: NvsPointF,
): NvsPointF {
  return viewDragToCanonicalOffset(liveWindow, startView, currentView);
}

export async function applyVideoTransformGesture(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  ownerPositionUs: number,
  gesture: VideoTransformGesture,
  writeKeyframe = false,
): Promise<NvsVideoFx> {
  const scaleX = gesture.scaleMultiplierX ?? 1;
  const scaleY = gesture.scaleMultiplierY ?? 1;
  if (scaleX <= 0 || scaleY <= 0) throw new Error('Video scale multipliers must be positive.');
  const localTimeUs = ownerPositionUs - clip.getInPoint();
  if (writeKeyframe && (localTimeUs < 0 || ownerPositionUs >= clip.getOutPoint())) {
    throw new Error('Owner position must be inside the clip when writing video transform keyframes.');
  }

  await context.streamingEngineReadyForTimelineModification();
  clip.enablePropertyVideoFx(true);
  const property = clip.getPropertyVideoFx();
  if (!property) throw new Error('The SDK did not expose the clip property effect.');
  const get = (name: string) => writeKeyframe
    ? property.getFloatValAtTime(name, localTimeUs)
    : property.getFloatVal(name);
  const set = (name: string, value: number) => {
    if (writeKeyframe) property.setFloatValAtTime(name, value, localTimeUs);
    else property.setFloatVal(name, value);
  };
  const applyScaleAndFlip = (
    name: 'Scale X' | 'Scale Y',
    multiplier: number | undefined,
    requestedFlip: boolean | undefined,
  ) => {
    if (multiplier === undefined && requestedFlip === undefined) return;
    const current = get(name);
    const magnitude = Math.abs(current) * (multiplier ?? 1);
    const flipped = requestedFlip ?? current < 0;
    set(name, flipped ? -magnitude : magnitude);
  };

  if (gesture.translationOffset) {
    set('Trans X', get('Trans X') + gesture.translationOffset.x);
    set('Trans Y', get('Trans Y') + gesture.translationOffset.y);
  }
  applyScaleAndFlip('Scale X', gesture.scaleMultiplierX, gesture.horizontalFlip);
  applyScaleAndFlip('Scale Y', gesture.scaleMultiplierY, gesture.verticalFlip);
  if (gesture.rotationDeltaDegrees !== undefined) {
    set('Rotation', get('Rotation') + gesture.rotationDeltaDegrees);
  }
  return property;
}
