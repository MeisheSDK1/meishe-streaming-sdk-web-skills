import { sdkVectorToArray, type ReadonlySdkVector } from '../utils/sdk-vector';

export function readEffectParameterKeyframes(
  effect: NvsFx,
  parameterName: string,
): NvsKeyframeParamInfo[] {
  if (!parameterName.trim()) throw new Error('Provide a verified effect parameter name.');
  if (!effect.hasKeyframeList(parameterName)) return [];
  const vector = effect.getParamKeyframes(parameterName) as unknown as
    | ReadonlySdkVector<NvsKeyframeParamInfo>
    | null;
  if (!vector) throw new Error(`The SDK reported keyframes for ${parameterName} but returned no list.`);
  return sdkVectorToArray(vector);
}

/**
 * Enumerate keyframe times when getParamKeyframes() is unsupported by an owner.
 * Compound captions use this source-verified path in the production editor.
 */
export function findEffectParameterKeyframeTimes(
  effect: NvsFx,
  parameterName: string,
  maximumKeyframes = 10_000,
): number[] {
  if (!parameterName.trim()) throw new Error('Provide a verified effect parameter name.');
  if (!Number.isInteger(maximumKeyframes) || maximumKeyframes <= 0) {
    throw new Error('maximumKeyframes must be a positive integer.');
  }
  if (!effect.hasKeyframeList(parameterName)) return [];

  const times: number[] = [];
  // Mode 0 is the source-verified exact-time lookup; Before/After are public enum values.
  let time = effect.findKeyframeTime(parameterName, 0, 0);
  if (time < 0) time = effect.findKeyframeTime(parameterName, 0, NvsKeyFrameFindModeEnum.After);
  while (time >= 0) {
    if (times.length >= maximumKeyframes) {
      throw new Error(`Keyframe enumeration exceeded ${maximumKeyframes}; stop instead of looping indefinitely.`);
    }
    if (times.at(-1) === time) throw new Error('The SDK returned the same keyframe for an After search.');
    times.push(time);
    time = effect.findKeyframeTime(parameterName, time, NvsKeyFrameFindModeEnum.After);
  }
  return times;
}

export function readCompoundCaptionKeyframes<T>(
  caption: NvsCompoundCaption,
  parameterName: string,
  readCurrentValue: (caption: NvsCompoundCaption) => T,
): Array<{ timeUs: number; value: T }> {
  try {
    return findEffectParameterKeyframeTimes(caption, parameterName).map((timeUs) => {
      caption.setCurrentKeyFrameTime(timeUs);
      return { timeUs, value: readCurrentValue(caption) };
    });
  } finally {
    caption.setCurrentKeyFrameTime(-1);
  }
}
