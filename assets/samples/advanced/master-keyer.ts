import { samplePixelAtClientPoint } from '../live-window/coordinate-conversion';

const MASTER_KEYER = 'Master Keyer';
const EPSILON = 0.0001;

export interface MasterKeyerOptions {
  keyColor: NvsColor;
  soften?: number;
  spillRemoval?: boolean;
  spillRemovalIntensity?: number;
  shrinkIntensity?: number;
  disablePremultiply?: boolean;
  apertureDegrees?: number;
}

export interface MasterKeyerColorPickSession {
  commit(clientX: number, clientY: number): Promise<NvsColor>;
  cancel(): Promise<void>;
}

interface ResolvedMasterKeyerOptions {
  keyColor: NvsColor;
  soften: number;
  spillRemoval: boolean;
  spillRemovalIntensity: number;
  shrinkIntensity: number;
  disablePremultiply: boolean;
  apertureDegrees: number;
}

function requireRange(value: number | undefined, min: number, max: number, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
}

function cloneColor(color: NvsColor): NvsColor {
  if (![color.r, color.g, color.b, color.a].every(Number.isFinite)) {
    throw new Error('Master Keyer colors must contain finite RGBA channels.');
  }
  return new NvsColor(color.r, color.g, color.b, color.a);
}

function resolveOptions(options: MasterKeyerOptions): ResolvedMasterKeyerOptions {
  requireRange(options.soften, -1, 1, 'Softeness Amendment');
  requireRange(options.spillRemovalIntensity, 0, 1, 'Spill Removal Intensity');
  requireRange(options.shrinkIntensity, 0, 1, 'Shrink Intensity');
  requireRange(options.apertureDegrees, 0, 360, 'Aperture');
  return {
    keyColor: cloneColor(options.keyColor),
    soften: options.soften ?? 0,
    spillRemoval: options.spillRemoval ?? true,
    spillRemovalIntensity: options.spillRemovalIntensity ?? 0.25,
    shrinkIntensity: options.shrinkIntensity ?? 0,
    disablePremultiply: options.disablePremultiply ?? false,
    apertureDegrees: options.apertureDegrees ?? 90,
  };
}

function masterKeyerEffects(clip: NvsVideoClip): NvsVideoFx[] {
  return Array.from({ length: clip.getRawFxCount() }, (_, index) => clip.getRawFxByIndex(index))
    .filter((effect) => effect?.getBuiltinVideoFxName() === MASTER_KEYER);
}

function readMasterKeyer(effect: NvsVideoFx): ResolvedMasterKeyerOptions {
  return {
    keyColor: cloneColor(effect.getColorVal('Key Color')),
    soften: effect.getFloatVal('Softeness Amendment'),
    spillRemoval: effect.getBooleanVal('Spill Removal'),
    spillRemovalIntensity: effect.getFloatVal('Spill Removal Intensity'),
    shrinkIntensity: effect.getFloatVal('Shrink Intensity'),
    disablePremultiply: effect.getBooleanVal('Disable Premultiply'),
    apertureDegrees: effect.getFloatVal('Aperture'),
  };
}

function removeMasterKeyerEffects(clip: NvsVideoClip, strict = true): void {
  for (const effect of masterKeyerEffects(clip).sort((left, right) => right.getIndex() - left.getIndex())) {
    if (!clip.removeRawFx(effect.getIndex()) && strict) {
      throw new Error('The SDK could not remove the Master Keyer effect.');
    }
  }
}

function appendMasterKeyer(clip: NvsVideoClip, options: ResolvedMasterKeyerOptions): NvsVideoFx {
  const effect = clip.appendRawBuiltinFx(MASTER_KEYER);
  if (!effect) throw new Error('The SDK could not append the raw-input Master Keyer effect.');
  effect.setColorVal('Key Color', options.keyColor);
  effect.setFloatVal('Softeness Amendment', options.soften);
  effect.setBooleanVal('Spill Removal', options.spillRemoval);
  effect.setFloatVal('Spill Removal Intensity', options.spillRemovalIntensity);
  effect.setFloatVal('Shrink Intensity', options.shrinkIntensity);
  effect.setBooleanVal('Disable Premultiply', options.disablePremultiply);
  effect.setFloatVal('Aperture', options.apertureDegrees);

  const actual = readMasterKeyer(effect);
  if (Math.abs(actual.keyColor.r - options.keyColor.r) > EPSILON ||
    Math.abs(actual.keyColor.g - options.keyColor.g) > EPSILON ||
    Math.abs(actual.keyColor.b - options.keyColor.b) > EPSILON ||
    Math.abs(actual.soften - options.soften) > EPSILON ||
    actual.spillRemoval !== options.spillRemoval ||
    Math.abs(actual.spillRemovalIntensity - options.spillRemovalIntensity) > EPSILON ||
    Math.abs(actual.shrinkIntensity - options.shrinkIntensity) > EPSILON ||
    actual.disablePremultiply !== options.disablePremultiply ||
    Math.abs(actual.apertureDegrees - options.apertureDegrees) > EPSILON) {
    throw new Error('The SDK did not round-trip the requested Master Keyer parameters.');
  }
  return effect;
}

export function pickMasterKeyerColor(
  liveWindow: NvsLiveWindow,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): NvsColor {
  return samplePixelAtClientPoint(liveWindow, canvas, clientX, clientY);
}

export async function addMasterKeyer(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  options: MasterKeyerOptions,
): Promise<{ effect: NvsVideoFx; remove(): Promise<void> }> {
  const requested = resolveOptions(options);
  await context.streamingEngineReadyForTimelineModification();
  const previousEffect = masterKeyerEffects(clip)[0];
  const previous = previousEffect ? readMasterKeyer(previousEffect) : null;
  try {
    removeMasterKeyerEffects(clip);
    const effect = appendMasterKeyer(clip, requested);
    return {
      effect,
      async remove() {
        await context.streamingEngineReadyForTimelineModification();
        removeMasterKeyerEffects(clip);
      },
    };
  } catch (error) {
    removeMasterKeyerEffects(clip, false);
    if (previous) {
      try {
        appendMasterKeyer(clip, previous);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Master Keyer update and rollback both failed.');
      }
    }
    throw error;
  }
}

export async function beginMasterKeyerColorPick(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  clip: NvsVideoClip,
  liveWindow: NvsLiveWindow,
  canvas: HTMLCanvasElement,
): Promise<MasterKeyerColorPickSession> {
  const effect = masterKeyerEffects(clip)[0];
  if (!effect) throw new Error('Apply Master Keyer before starting its color picker.');
  const original = readMasterKeyer(effect);
  const positionUs = context.getTimelineCurrentPosition(timeline);
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  try {
    removeMasterKeyerEffects(clip);
    if (!context.seekTimeline(timeline, positionUs, NvsVideoPreviewSizeModeEnum.LiveWindowSize, 0)) {
      throw new Error('The SDK could not render the untreated frame for color picking.');
    }
    await context.lastSeekingFinished();
  } catch (error) {
    removeMasterKeyerEffects(clip, false);
    try {
      appendMasterKeyer(clip, original);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Master Keyer color-pick setup and rollback both failed.');
    }
    throw error;
  }

  let active = true;
  const restore = async (options: ResolvedMasterKeyerOptions) => {
    await addMasterKeyer(context, clip, options);
    if (!context.seekTimeline(timeline, positionUs, NvsVideoPreviewSizeModeEnum.LiveWindowSize, 0)) {
      throw new Error('The SDK could not refresh Master Keyer after color picking.');
    }
    await context.lastSeekingFinished();
  };
  return {
    async commit(clientX, clientY) {
      if (!active) throw new Error('The Master Keyer color-pick session has ended.');
      active = false;
      try {
        const keyColor = pickMasterKeyerColor(liveWindow, canvas, clientX, clientY);
        await restore({ ...original, keyColor });
        return keyColor;
      } catch (error) {
        try {
          await restore(original);
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'Master Keyer color pick and rollback both failed.');
        }
        throw error;
      }
    },
    async cancel() {
      if (!active) return;
      active = false;
      await restore(original);
    },
  };
}
