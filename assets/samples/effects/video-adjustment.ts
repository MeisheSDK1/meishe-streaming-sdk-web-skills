import {
  ADJUSTMENT_FX_NAMES,
  AdjustmentFxName,
  AdjustmentValues,
  resetAdjustmentFx,
  setAdjustmentValues,
} from './adjustment-schema';

export type VideoAdjustmentStack = Record<AdjustmentFxName, NvsVideoFx>;

function findRawBuiltinFx(clip: NvsVideoClip, fxName: AdjustmentFxName): NvsVideoFx | undefined {
  for (let index = 0; index < clip.getRawFxCount(); index += 1) {
    const fx = clip.getRawFxByIndex(index);
    if (fx?.getBuiltinVideoFxName() === fxName) return fx;
  }
  return undefined;
}

export async function ensureVideoAdjustmentStack(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  absoluteTimeUsed = false,
): Promise<VideoAdjustmentStack> {
  await context.streamingEngineReadyForTimelineModification();
  const stack = {} as VideoAdjustmentStack;
  for (const fxName of ADJUSTMENT_FX_NAMES) {
    let fx = findRawBuiltinFx(clip, fxName);
    if (!fx) {
      fx = clip.appendRawBuiltinFx(fxName);
      if (fx) {
        fx.setAbsoluteTimeUsed(absoluteTimeUsed);
        // Some built-ins have non-zero SDK defaults; normalize a newly created stack.
        resetAdjustmentFx(fx, fxName);
      }
    }
    if (!fx) throw new Error(`The SDK could not create the raw ${fxName} adjustment effect.`);
    stack[fxName] = fx;
  }
  return stack;
}

export async function setVideoAdjustments(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  values: Partial<Record<AdjustmentFxName, AdjustmentValues>>,
): Promise<VideoAdjustmentStack> {
  const stack = await ensureVideoAdjustmentStack(context, clip);
  for (const fxName of ADJUSTMENT_FX_NAMES) {
    const fxValues = values[fxName];
    if (fxValues) setAdjustmentValues(stack[fxName], fxName, fxValues);
  }
  return stack;
}

export function resetVideoAdjustments(stack: VideoAdjustmentStack): void {
  for (const fxName of ADJUSTMENT_FX_NAMES) resetAdjustmentFx(stack[fxName], fxName);
}
