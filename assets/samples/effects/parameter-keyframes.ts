export type FxKeyframe =
  | { type: 'float'; parameter: string; value: number; localTimeUs: number }
  | { type: 'int'; parameter: string; value: number; localTimeUs: number }
  | { type: 'boolean'; parameter: string; value: boolean; localTimeUs: number }
  | { type: 'string'; parameter: string; value: string; localTimeUs: number }
  | { type: 'menu'; parameter: string; value: string; localTimeUs: number }
  | { type: 'color'; parameter: string; value: NvsColor; localTimeUs: number };

export function setEffectKeyframes(effect: NvsFx, keyframes: FxKeyframe[]): void {
  for (const keyframe of [...keyframes].sort((left, right) => left.localTimeUs - right.localTimeUs)) {
    if (!keyframe.parameter || keyframe.localTimeUs < 0) {
      throw new Error('Each effect keyframe needs a verified parameter and non-negative time.');
    }
    switch (keyframe.type) {
      case 'float': effect.setFloatValAtTime(keyframe.parameter, keyframe.value, keyframe.localTimeUs); break;
      case 'int': effect.setIntValAtTime(keyframe.parameter, keyframe.value, keyframe.localTimeUs); break;
      case 'boolean': effect.setBooleanValAtTime(keyframe.parameter, keyframe.value, keyframe.localTimeUs); break;
      case 'string': effect.setStringValAtTime(keyframe.parameter, keyframe.value, keyframe.localTimeUs); break;
      case 'menu': effect.setMenuValAtTime(keyframe.parameter, keyframe.value, keyframe.localTimeUs); break;
      case 'color': effect.setColorValAtTime(keyframe.parameter, keyframe.value, keyframe.localTimeUs); break;
    }
  }
}

export function removeEffectKeyframe(effect: NvsFx, parameter: string, localTimeUs: number): void {
  if (!effect.removeKeyframeAtTime(parameter, localTimeUs)) {
    throw new Error(`No removable keyframe was found for ${parameter} at ${localTimeUs}.`);
  }
}

export function removeAllEffectKeyframes(effect: NvsFx, parameter: string): void {
  if (!parameter) throw new Error('Provide the exact effect parameter name.');
  effect.removeAllKeyframe(parameter);
}

export function setTimelineEffectExpressionVariable(
  effect: NvsTimelineVideoFx,
  name: string,
  value: number,
): void {
  if (!name || !Number.isFinite(value)) throw new Error('Expression variables require a name and finite number.');
  effect.setExprVar(name, value);
}
