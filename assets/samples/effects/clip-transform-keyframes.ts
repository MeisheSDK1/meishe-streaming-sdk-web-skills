import { findEffectParameterKeyframeTimes } from './keyframe-inspection';

export type ClipTransformKeyframeProperty = 'scale' | 'position' | 'opacity' | 'rotation';

export interface ClipTransformKeyframeValue {
  scale?: number;
  translationX?: number;
  translationY?: number;
  opacity?: number;
  rotationDegrees?: number;
}

const CLIP_TRANSFORM_KEYFRAME_PARAMETERS: Record<ClipTransformKeyframeProperty, readonly string[]> = {
  scale: ['Scale X', 'Scale Y'],
  position: ['Trans X', 'Trans Y'],
  opacity: ['Opacity'],
  rotation: ['Rotation'],
};

function requireLocalTime(localTimeUs: number, clipDurationUs: number): void {
  if (!Number.isFinite(localTimeUs) || localTimeUs < 0 || localTimeUs >= clipDurationUs) {
    throw new Error('Video transform keyframe time must be inside the clip-local duration.');
  }
}

function parameterKeyframeTimes(propertyFx: NvsVideoFx, parameters: readonly string[]): Map<string, Set<number>> {
  return new Map(parameters.map((parameter) => [
    parameter,
    new Set(findEffectParameterKeyframeTimes(propertyFx, parameter)),
  ]));
}

function requireCompleteGroupAtTime(
  propertyFx: NvsVideoFx,
  property: ClipTransformKeyframeProperty,
  localTimeUs: number,
): readonly string[] {
  const parameters = CLIP_TRANSFORM_KEYFRAME_PARAMETERS[property];
  const presence = [...parameterKeyframeTimes(propertyFx, parameters).values()]
    .map((times) => times.has(localTimeUs));
  if (!presence.some(Boolean)) throw new Error(`No removable ${property} keyframe exists at ${localTimeUs}.`);
  if (!presence.every(Boolean)) throw new Error(`The ${property} keyframe group is incomplete at ${localTimeUs}.`);
  return parameters;
}

export function setClipTransformKeyframeGroup(
  propertyFx: NvsVideoFx,
  property: ClipTransformKeyframeProperty,
  localTimeUs: number,
  clipDurationUs: number,
  value: ClipTransformKeyframeValue,
): void {
  requireLocalTime(localTimeUs, clipDurationUs);
  if (property === 'scale') {
    if (value.scale === undefined) throw new Error('Scale keyframes require scale.');
    propertyFx.setFloatValAtTime('Scale X', value.scale, localTimeUs);
    propertyFx.setFloatValAtTime('Scale Y', value.scale, localTimeUs);
  } else if (property === 'position') {
    if (value.translationX === undefined || value.translationY === undefined) {
      throw new Error('Position keyframes require both translationX and translationY.');
    }
    propertyFx.setFloatValAtTime('Trans X', value.translationX, localTimeUs);
    propertyFx.setFloatValAtTime('Trans Y', value.translationY, localTimeUs);
  } else if (property === 'opacity') {
    if (value.opacity === undefined) throw new Error('Opacity keyframes require opacity.');
    propertyFx.setFloatValAtTime('Opacity', value.opacity, localTimeUs);
  } else {
    if (value.rotationDegrees === undefined) throw new Error('Rotation keyframes require rotationDegrees.');
    propertyFx.setFloatValAtTime('Rotation', value.rotationDegrees, localTimeUs);
  }
}

export function removeClipTransformKeyframeGroup(
  propertyFx: NvsVideoFx,
  property: ClipTransformKeyframeProperty,
  localTimeUs: number,
  clipDurationUs: number,
): void {
  requireLocalTime(localTimeUs, clipDurationUs);
  const parameters = requireCompleteGroupAtTime(propertyFx, property, localTimeUs);
  const previous = new Map(parameters.map((parameter) => [
    parameter,
    propertyFx.getFloatValAtTime(parameter, localTimeUs),
  ]));
  const removed = parameters.map((parameter) => propertyFx.removeKeyframeAtTime(parameter, localTimeUs));
  if (!removed.every(Boolean)) {
    parameters.forEach((parameter) => {
      propertyFx.setFloatValAtTime(parameter, previous.get(parameter)!, localTimeUs);
    });
    throw new Error(`The SDK could not remove the complete ${property} keyframe group at ${localTimeUs}.`);
  }
}

export function readGroupedClipTransformKeyframeTimes(
  propertyFx: NvsVideoFx,
): Array<{ localTimeUs: number; properties: ClipTransformKeyframeProperty[] }> {
  const grouped = new Map<number, Set<ClipTransformKeyframeProperty>>();
  for (const [property, parameters] of Object.entries(CLIP_TRANSFORM_KEYFRAME_PARAMETERS) as Array<
    [ClipTransformKeyframeProperty, readonly string[]]
  >) {
    const timesByParameter = parameterKeyframeTimes(propertyFx, parameters);
    const times = new Set<number>();
    for (const parameterTimes of timesByParameter.values()) {
      for (const time of parameterTimes) times.add(time);
    }
    for (const localTimeUs of times) {
      if (![...timesByParameter.values()].every((parameterTimes) => parameterTimes.has(localTimeUs))) {
        throw new Error(`The ${property} keyframe group is incomplete at ${localTimeUs}.`);
      }
      const properties = grouped.get(localTimeUs) ?? new Set<ClipTransformKeyframeProperty>();
      properties.add(property);
      grouped.set(localTimeUs, properties);
    }
  }
  return [...grouped]
    .sort(([left], [right]) => left - right)
    .map(([localTimeUs, properties]) => ({ localTimeUs, properties: [...properties] }));
}
