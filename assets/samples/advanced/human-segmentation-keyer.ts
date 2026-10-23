import { initializeHumanDetection, type HumanDetectionSession } from './human-detection';

const OBJECT_STROKE = 'Object Stroke';
const MAX_REFERENCE_STROKE_VALUE = 30;
const EPSILON = 0.0001;

export type StrokeType = 'Solid Line' | 'Dash Line';

export interface HumanSegmentationKeyerState {
  enabled: boolean;
  strokeType: StrokeType;
  strokeColor: NvsColor;
  strokeWidth: number;
  strokeOffset: number;
}

interface ObjectStrokeParameters extends HumanSegmentationKeyerState {
  inputIsSegmented: boolean;
  noBackground: boolean;
}

function cloneColor(color: NvsColor): NvsColor {
  if (![color.r, color.g, color.b, color.a].every(Number.isFinite)) {
    throw new Error('Object Stroke colors must contain finite RGBA channels.');
  }
  return new NvsColor(color.r, color.g, color.b, color.a);
}

function validateState(state: HumanSegmentationKeyerState): ObjectStrokeParameters {
  if (state.strokeType !== 'Solid Line' && state.strokeType !== 'Dash Line') {
    throw new Error('Object Stroke type must be Solid Line or Dash Line.');
  }
  // The supplied reference editor and a Web 3.16.2 render check use 0..30.
  // Keep target-runtime round-trip/render validation mandatory for this built-in schema.
  for (const [label, value] of [['Stroke Width', state.strokeWidth], ['Stroke Offset From Object', state.strokeOffset]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > MAX_REFERENCE_STROKE_VALUE) {
      throw new Error(`${label} must be between 0 and ${MAX_REFERENCE_STROKE_VALUE}.`);
    }
  }
  return {
    ...state,
    strokeColor: cloneColor(state.strokeColor),
    inputIsSegmented: false,
    noBackground: true,
  };
}

function objectStrokeEffects(clip: NvsVideoClip): NvsVideoFx[] {
  return Array.from({ length: clip.getRawFxCount() }, (_, index) => clip.getRawFxByIndex(index))
    .filter((effect) => effect?.getBuiltinVideoFxName() === OBJECT_STROKE);
}

function readObjectStroke(effect: NvsVideoFx): ObjectStrokeParameters {
  return {
    enabled: true,
    strokeType: effect.getMenuVal('Stroke Type') as StrokeType,
    strokeColor: cloneColor(effect.getColorVal('Stroke Color')),
    strokeWidth: effect.getFloatVal('Stroke Width'),
    strokeOffset: effect.getFloatVal('Stroke Offset From Object'),
    inputIsSegmented: effect.getBooleanVal('Input Is Segmented'),
    noBackground: effect.getBooleanVal('No Background'),
  };
}

function removeObjectStrokeEffects(clip: NvsVideoClip, strict = true): void {
  for (const effect of objectStrokeEffects(clip).sort((left, right) => right.getIndex() - left.getIndex())) {
    if (!clip.removeRawFx(effect.getIndex()) && strict) {
      throw new Error('The SDK could not remove Object Stroke.');
    }
  }
}

function appendObjectStroke(clip: NvsVideoClip, state: ObjectStrokeParameters): NvsVideoFx {
  const effect = clip.appendRawBuiltinFx(OBJECT_STROKE);
  if (!effect) throw new Error('The SDK could not append Object Stroke.');
  effect.setMenuVal('Stroke Type', state.strokeType);
  effect.setFloatVal('Stroke Width', state.strokeWidth);
  effect.setColorVal('Stroke Color', state.strokeColor);
  effect.setBooleanVal('Input Is Segmented', state.inputIsSegmented);
  effect.setFloatVal('Stroke Offset From Object', state.strokeOffset);
  effect.setBooleanVal('No Background', state.noBackground);

  const actual = readObjectStroke(effect);
  if (actual.strokeType !== state.strokeType ||
    Math.abs(actual.strokeWidth - state.strokeWidth) > EPSILON ||
    Math.abs(actual.strokeOffset - state.strokeOffset) > EPSILON ||
    Math.abs(actual.strokeColor.r - state.strokeColor.r) > EPSILON ||
    Math.abs(actual.strokeColor.g - state.strokeColor.g) > EPSILON ||
    Math.abs(actual.strokeColor.b - state.strokeColor.b) > EPSILON ||
    actual.inputIsSegmented !== state.inputIsSegmented || actual.noBackground !== state.noBackground) {
    throw new Error('The SDK did not round-trip the requested Object Stroke parameters.');
  }
  return effect;
}

export function initializeBackgroundSegmentation(
  context: NvsStreamingContext,
  modelFilePath: string,
  licenseFilePath = '',
): HumanDetectionSession {
  return initializeHumanDetection(context, {
    modelFilePath,
    licenseFilePath,
    features: NvsHumanDetectionFeatureEnum.SegmentationBackground,
  });
}

export function backgroundSegmentationPreviewFlags(): { seekFlags: number; playbackFlags: number } {
  return {
    seekFlags: NvsSeekFlagEnum.BuddyHostVideoFrame,
    playbackFlags: NvsPlaybackFlagEnum.BuddyHostVideoFrame,
  };
}

export async function replaceHumanSegmentationKeyer(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  state: HumanSegmentationKeyerState,
): Promise<NvsVideoFx | null> {
  const requested = validateState(state);
  await context.streamingEngineReadyForTimelineModification();
  const previousEffect = objectStrokeEffects(clip)[0];
  const previous = previousEffect ? readObjectStroke(previousEffect) : null;
  try {
    removeObjectStrokeEffects(clip);
    if (!state.enabled) return null;
    return appendObjectStroke(clip, requested);
  } catch (error) {
    removeObjectStrokeEffects(clip, false);
    if (previous) {
      try {
        appendObjectStroke(clip, previous);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Object Stroke update and rollback both failed.');
      }
    }
    throw error;
  }
}

export async function removeHumanSegmentationKeyer(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
): Promise<void> {
  await context.streamingEngineReadyForTimelineModification();
  removeObjectStrokeEffects(clip);
}
