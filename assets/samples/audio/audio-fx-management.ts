export const AUDIO_LOUDNESS_FX = 'Audio LoudNorm';
export const AUDIO_LOUDNESS_PARAMETER = 'Integrated Loudness';
export const AUDIO_NOISE_SUPPRESSION_FX = 'Audio Noise Suppression';
export const AUDIO_NOISE_SUPPRESSION_PARAMETER = 'Level';

export const BUILTIN_AUDIO_PRESETS = [
  'Fast Cartoon Voice',
  'Audio Reverb',
  'Audio Wahwah',
  'Female Voice',
  'Male Voice',
  'Cartoon Voice',
  'Audio Echo',
  'Monster Voice',
] as const;

export type BuiltinAudioPreset = typeof BUILTIN_AUDIO_PRESETS[number];

export interface ManagedAudioProcessingState {
  loudnessEnabled: boolean;
  loudnessLufs: number;
  noiseSuppressionEnabled: boolean;
  noiseSuppressionLevel: number;
  preset: BuiltinAudioPreset | null;
}

export const DEFAULT_MANAGED_AUDIO_PROCESSING: ManagedAudioProcessingState = {
  loudnessEnabled: false,
  loudnessLufs: -23,
  noiseSuppressionEnabled: false,
  noiseSuppressionLevel: 1,
  preset: null,
};

const presetNames = new Set<string>(BUILTIN_AUDIO_PRESETS);
const managedNames = new Set<string>([
  AUDIO_LOUDNESS_FX,
  AUDIO_NOISE_SUPPRESSION_FX,
  ...BUILTIN_AUDIO_PRESETS,
]);

function listAudioFx(clip: NvsAudioClip): NvsAudioFx[] {
  const effects: NvsAudioFx[] = [];
  for (let index = 0; index < clip.getFxCount(); index += 1) {
    const effect = clip.getFxByIndex(index);
    if (effect) effects.push(effect);
  }
  return effects;
}

function findAudioFx(clip: NvsAudioClip, name: string): NvsAudioFx | undefined {
  return listAudioFx(clip).find((effect) => effect.getBuiltinAudioFxName() === name);
}

function removeAudioFxByNames(clip: NvsAudioClip, names: ReadonlySet<string>): void {
  listAudioFx(clip)
    .filter((effect) => names.has(effect.getBuiltinAudioFxName()))
    .sort((left, right) => right.getIndex() - left.getIndex())
    .forEach((effect) => {
      if (!clip.removeFx(effect.getIndex())) {
        throw new Error(`The SDK could not remove managed audio effect ${effect.getBuiltinAudioFxName()}.`);
      }
    });
}

function appendAudioFx(clip: NvsAudioClip, name: string): NvsAudioFx {
  const effect = clip.appendFx(name);
  if (!effect) throw new Error(`The SDK could not append managed audio effect ${name}.`);
  return effect;
}

function validateState(state: ManagedAudioProcessingState): void {
  if (!Number.isFinite(state.loudnessLufs) || state.loudnessLufs < -70 || state.loudnessLufs > -5) {
    throw new Error('Integrated loudness must be within [-70, -5] LUFS.');
  }
  if (!Number.isInteger(state.noiseSuppressionLevel) || state.noiseSuppressionLevel < 1 || state.noiseSuppressionLevel > 4) {
    throw new Error('Noise-suppression level must be an integer within [1, 4].');
  }
  if (state.preset !== null && !presetNames.has(state.preset)) {
    throw new Error('The requested built-in audio preset is not managed by this workflow.');
  }
}

export function readManagedAudioProcessing(clip: NvsAudioClip): ManagedAudioProcessingState {
  const loudness = findAudioFx(clip, AUDIO_LOUDNESS_FX);
  const noiseSuppression = findAudioFx(clip, AUDIO_NOISE_SUPPRESSION_FX);
  const preset = listAudioFx(clip)
    .map((effect) => effect.getBuiltinAudioFxName())
    .find((name): name is BuiltinAudioPreset => presetNames.has(name)) ?? null;
  return {
    loudnessEnabled: Boolean(loudness),
    loudnessLufs: loudness
      ? loudness.getFloatVal(AUDIO_LOUDNESS_PARAMETER)
      : DEFAULT_MANAGED_AUDIO_PROCESSING.loudnessLufs,
    noiseSuppressionEnabled: Boolean(noiseSuppression),
    noiseSuppressionLevel: noiseSuppression
      ? noiseSuppression.getIntVal(AUDIO_NOISE_SUPPRESSION_PARAMETER)
      : DEFAULT_MANAGED_AUDIO_PROCESSING.noiseSuppressionLevel,
    preset,
  };
}

function writeManagedAudioProcessing(
  clip: NvsAudioClip,
  state: ManagedAudioProcessingState,
): void {
  removeAudioFxByNames(clip, managedNames);
  if (state.loudnessEnabled) {
    appendAudioFx(clip, AUDIO_LOUDNESS_FX)
      .setFloatVal(AUDIO_LOUDNESS_PARAMETER, state.loudnessLufs);
  }
  if (state.noiseSuppressionEnabled) {
    appendAudioFx(clip, AUDIO_NOISE_SUPPRESSION_FX)
      .setIntVal(AUDIO_NOISE_SUPPRESSION_PARAMETER, state.noiseSuppressionLevel);
  }
  if (state.preset) appendAudioFx(clip, state.preset);
}

export function replaceManagedAudioProcessing(
  clip: NvsAudioClip,
  state: ManagedAudioProcessingState,
): void {
  validateState(state);
  const previous = readManagedAudioProcessing(clip);
  try {
    writeManagedAudioProcessing(clip, state);
  } catch (error) {
    try {
      writeManagedAudioProcessing(clip, previous);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Managed audio-effect replacement and rollback both failed.');
    }
    throw error;
  }
}

export function updateManagedAudioProcessing(
  clip: NvsAudioClip,
  patch: Partial<ManagedAudioProcessingState>,
): ManagedAudioProcessingState {
  const previous = readManagedAudioProcessing(clip);
  const target = { ...previous, ...patch };
  validateState(target);
  try {
    if (patch.loudnessEnabled !== undefined || patch.loudnessLufs !== undefined) {
      const current = findAudioFx(clip, AUDIO_LOUDNESS_FX);
      if (!target.loudnessEnabled) removeAudioFxByNames(clip, new Set([AUDIO_LOUDNESS_FX]));
      else (current ?? appendAudioFx(clip, AUDIO_LOUDNESS_FX))
        .setFloatVal(AUDIO_LOUDNESS_PARAMETER, target.loudnessLufs);
    }
    if (patch.noiseSuppressionEnabled !== undefined || patch.noiseSuppressionLevel !== undefined) {
      const current = findAudioFx(clip, AUDIO_NOISE_SUPPRESSION_FX);
      if (!target.noiseSuppressionEnabled) {
        removeAudioFxByNames(clip, new Set([AUDIO_NOISE_SUPPRESSION_FX]));
      } else {
        (current ?? appendAudioFx(clip, AUDIO_NOISE_SUPPRESSION_FX))
          .setIntVal(AUDIO_NOISE_SUPPRESSION_PARAMETER, target.noiseSuppressionLevel);
      }
    }
    if (patch.preset !== undefined) {
      removeAudioFxByNames(clip, presetNames);
      if (target.preset) appendAudioFx(clip, target.preset);
    }
    return readManagedAudioProcessing(clip);
  } catch (error) {
    replaceManagedAudioProcessing(clip, previous);
    throw error;
  }
}
