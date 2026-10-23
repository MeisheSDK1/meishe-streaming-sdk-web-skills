import {
  ADJUSTMENT_FX_NAMES,
  AdjustmentFxName,
  AdjustmentValues,
  resetAdjustmentFx,
  setAdjustmentValues,
} from './adjustment-schema';

export type TimelineAdjustmentStack = Record<AdjustmentFxName, NvsTimelineVideoFx>;

export interface TimelineAdjustmentHandle {
  effects: TimelineAdjustmentStack;
  reset(): void;
  remove(): Promise<void>;
}

export async function addTimelineAdjustmentStack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  inPointUs: number,
  durationUs: number,
  values: Partial<Record<AdjustmentFxName, AdjustmentValues>> = {},
): Promise<TimelineAdjustmentHandle> {
  if (inPointUs < 0 || durationUs <= 0 || inPointUs + durationUs > timeline.getDuration()) {
    throw new Error('Timeline adjustment range must be inside the timeline.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const effects = {} as TimelineAdjustmentStack;
  const created: NvsTimelineVideoFx[] = [];
  try {
    for (const fxName of ADJUSTMENT_FX_NAMES) {
      const fx = timeline.addBuiltinTimelineVideoFx(inPointUs, durationUs, fxName);
      if (!fx) throw new Error(`The SDK could not create the timeline ${fxName} adjustment effect.`);
      effects[fxName] = fx;
      created.push(fx);
      // Some built-ins have non-zero SDK defaults; normalize a newly created stack.
      resetAdjustmentFx(fx, fxName);
      const fxValues = values[fxName];
      if (fxValues) setAdjustmentValues(fx, fxName, fxValues);
    }
  } catch (error) {
    for (const fx of created) timeline.removeTimelineVideoFx(fx);
    throw error;
  }

  let removed = false;
  return {
    effects,
    reset() {
      if (removed) throw new Error('The timeline adjustment stack has been removed.');
      for (const fxName of ADJUSTMENT_FX_NAMES) resetAdjustmentFx(effects[fxName], fxName);
    },
    async remove() {
      if (removed) return;
      await context.streamingEngineReadyForTimelineModification();
      for (const fxName of ADJUSTMENT_FX_NAMES) timeline.removeTimelineVideoFx(effects[fxName]);
      removed = true;
    },
  };
}

export function setTimelineAdjustments(
  stack: TimelineAdjustmentStack,
  values: Partial<Record<AdjustmentFxName, AdjustmentValues>>,
): void {
  for (const fxName of ADJUSTMENT_FX_NAMES) {
    const fxValues = values[fxName];
    if (fxValues) setAdjustmentValues(stack[fxName], fxName, fxValues);
  }
}
