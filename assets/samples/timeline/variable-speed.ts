import { mutateAndPreservePreview } from './preserve-preview-position';

export interface VariableSpeedResult {
  curvesString: string;
  inPointUs: number;
  outPointUs: number;
  trimInUs: number;
  trimOutUs: number;
  speed: number;
}

type SpeedClip = NvsVideoClip | NvsAudioClip;

export interface ClipSpeedMutationOptions {
  frameDurationUs: number;
  nextClipInPointUs?: number;
  keepAudioPitch?: boolean;
  /** Reconcile keyframes, package-animation ranges, and base duration before preview refresh. */
  reconcileOwnedLocalState?: (result: VariableSpeedResult) => void | Promise<void>;
}

function requireFrameDuration(frameDurationUs: number): void {
  if (!Number.isInteger(frameDurationUs) || frameDurationUs <= 0) {
    throw new Error('frameDurationUs must be a positive integer number of microseconds.');
  }
}

function timelineOutPointForDuration(
  clip: SpeedClip,
  durationUs: number,
  frameDurationUs: number,
): number {
  requireFrameDuration(frameDurationUs);
  if (!Number.isFinite(durationUs) || durationUs <= 0) {
    throw new Error('The speed-adjusted clip duration must be positive.');
  }
  const inPointUs = clip.getInPoint();
  return Math.max(
    inPointUs + frameDurationUs,
    Math.floor((inPointUs + durationUs) / frameDurationUs) * frameDurationUs,
  );
}

function requireAvailableRange(outPointUs: number, nextClipInPointUs?: number): void {
  if (nextClipInPointUs !== undefined && outPointUs > nextClipInPointUs) {
    throw new Error('The speed-adjusted clip would overlap the next clip on the track.');
  }
}

function readSpeedResult(clip: SpeedClip): VariableSpeedResult {
  return {
    curvesString: clip.getClipVariableSpeedCurvesString(),
    inPointUs: clip.getInPoint(),
    outPointUs: clip.getOutPoint(),
    trimInUs: clip.getTrimIn(),
    trimOutUs: clip.getTrimOut(),
    speed: clip.getSpeed(),
  };
}

export function calculateUniformSpeedDuration(clip: SpeedClip, speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('Speed must be a positive finite number.');
  return (clip.getTrimOut() - clip.getTrimIn()) / speed;
}

export async function applyUniformSpeed(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  clip: SpeedClip,
  speed: number,
  options: ClipSpeedMutationOptions,
): Promise<VariableSpeedResult> {
  const outPointUs = timelineOutPointForDuration(
    clip,
    calculateUniformSpeedDuration(clip, speed),
    options.frameDurationUs,
  );
  requireAvailableRange(outPointUs, options.nextClipInPointUs);
  return mutateAndPreservePreview(context, timeline, async () => {
    clip.changeSpeedWithOutPoint(outPointUs, speed, options.keepAudioPitch ?? true);
    if (clip.getOutPoint() !== outPointUs) throw new Error('The SDK did not apply the uniform-speed clip out-point.');
    const result = readSpeedResult(clip);
    await options.reconcileOwnedLocalState?.(result);
    return result;
  });
}

export function calculateVariableSpeedDuration(
  context: NvsStreamingContext,
  curvesString: string,
): number {
  if (!curvesString) throw new Error('Provide a documented SDK variable-speed curve string.');
  const durationUs = context.calcDurationAfterCurvesVariableSpeed(curvesString);
  if (!Number.isFinite(durationUs) || durationUs <= 0) {
    throw new Error('The SDK could not calculate a positive duration for the curve.');
  }
  return durationUs;
}

export async function applyVariableSpeedCurve(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  clip: SpeedClip,
  curvesString: string,
  options: ClipSpeedMutationOptions,
): Promise<VariableSpeedResult> {
  if (!curvesString) {
    throw new Error('Provide a curve string produced by a documented SDK/editor curve workflow.');
  }
  const outPointUs = timelineOutPointForDuration(
    clip,
    calculateVariableSpeedDuration(context, curvesString),
    options.frameDurationUs,
  );
  requireAvailableRange(outPointUs, options.nextClipInPointUs);
  return mutateAndPreservePreview(context, timeline, async () => {
    if (!clip.changeCurvesVariableSpeedWithOutPoint(outPointUs, curvesString, options.keepAudioPitch ?? true)) {
      throw new Error('The SDK rejected the variable-speed curve.');
    }
    if (clip.getOutPoint() !== outPointUs) throw new Error('The SDK did not apply the curve-speed clip out-point.');
    const result = readSpeedResult(clip);
    await options.reconcileOwnedLocalState?.(result);
    return result;
  });
}
