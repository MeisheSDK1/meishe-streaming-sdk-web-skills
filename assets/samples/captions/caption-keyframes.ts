import { findEffectParameterKeyframeTimes } from '../effects/keyframe-inspection';

export type CaptionTransformKeyframeProperty = 'position' | 'scale' | 'rotation';

const CAPTION_TRANSFORM_KEYFRAME_PARAMETERS: Record<CaptionTransformKeyframeProperty, readonly string[]> = {
  position: ['Caption TransX', 'Caption TransY'],
  scale: ['Caption ScaleX', 'Caption ScaleY'],
  rotation: ['Caption RotZ'],
};

export interface CaptionTransformKeyframe {
  /** Time relative to the caption in-point, in microseconds. */
  localTimeUs: number;
  translation?: NvsPointF;
  scaleX?: number;
  scaleY?: number;
  rotationZ?: number;
}

export function setCaptionTransformKeyframes(
  caption: NvsTimelineCaption | NvsTimelineCompoundCaption,
  keyframes: CaptionTransformKeyframe[],
): void {
  const durationUs = caption.getOutPoint() - caption.getInPoint();
  try {
    for (const keyframe of [...keyframes].sort((left, right) => left.localTimeUs - right.localTimeUs)) {
      if (keyframe.localTimeUs < 0 || keyframe.localTimeUs >= durationUs) {
        throw new Error('Caption keyframe time must be inside the caption-local duration.');
      }
      caption.setCurrentKeyFrameTime(keyframe.localTimeUs);
      if (keyframe.translation) caption.setCaptionTranslation(keyframe.translation);
      if (keyframe.scaleX !== undefined) caption.setScaleX(keyframe.scaleX);
      if (keyframe.scaleY !== undefined) caption.setScaleY(keyframe.scaleY);
      if (keyframe.rotationZ !== undefined) caption.setRotationZ(keyframe.rotationZ);
    }
  } finally {
    caption.setCurrentKeyFrameTime(-1);
  }
}

export function removeCaptionTransformKeyframe(
  caption: NvsTimelineCaption | NvsTimelineCompoundCaption,
  property: CaptionTransformKeyframeProperty,
  localTimeUs: number,
): void {
  if (localTimeUs < 0 || localTimeUs >= caption.getOutPoint() - caption.getInPoint()) {
    throw new Error('Caption keyframe time must be inside the caption-local duration.');
  }
  try {
    const parameters = CAPTION_TRANSFORM_KEYFRAME_PARAMETERS[property];
    const presence = parameters.map((parameter) =>
      findEffectParameterKeyframeTimes(caption, parameter).includes(localTimeUs));
    if (!presence.some(Boolean)) throw new Error(`No removable caption ${property} keyframe exists at ${localTimeUs}.`);
    if (!presence.every(Boolean)) throw new Error(`The caption ${property} keyframe group is incomplete at ${localTimeUs}.`);
    caption.setCurrentKeyFrameTime(localTimeUs);
    const previous = property === 'position'
      ? { translation: caption.getCaptionTranslation() }
      : property === 'scale'
        ? { scaleX: caption.getScaleX(), scaleY: caption.getScaleY() }
        : { rotationZ: caption.getRotationZ() };
    const removed = parameters.map((parameter) => caption.removeKeyframeAtTime(parameter, localTimeUs));
    if (!removed.every(Boolean)) {
      caption.setCurrentKeyFrameTime(localTimeUs);
      if ('translation' in previous) caption.setCaptionTranslation(previous.translation);
      else if ('scaleX' in previous) {
        caption.setScaleX(previous.scaleX!);
        caption.setScaleY(previous.scaleY!);
      } else caption.setRotationZ(previous.rotationZ);
      throw new Error(`The SDK could not remove the complete caption ${property} keyframe group at ${localTimeUs}.`);
    }
  } finally {
    caption.setCurrentKeyFrameTime(-1);
  }
}

export function readGroupedCaptionTransformKeyframeTimes(
  caption: NvsTimelineCaption | NvsTimelineCompoundCaption,
): Array<{ localTimeUs: number; properties: CaptionTransformKeyframeProperty[] }> {
  const grouped = new Map<number, Set<CaptionTransformKeyframeProperty>>();
  try {
    for (const [property, parameters] of Object.entries(CAPTION_TRANSFORM_KEYFRAME_PARAMETERS) as Array<
      [CaptionTransformKeyframeProperty, readonly string[]]
    >) {
      const timesByParameter = new Map(parameters.map((parameter) => [
        parameter,
        new Set(findEffectParameterKeyframeTimes(caption, parameter)),
      ]));
      const times = new Set<number>();
      for (const parameterTimes of timesByParameter.values()) {
        for (const time of parameterTimes) times.add(time);
      }
      for (const localTimeUs of times) {
        if (![...timesByParameter.values()].every((parameterTimes) => parameterTimes.has(localTimeUs))) {
          throw new Error(`The caption ${property} keyframe group is incomplete at ${localTimeUs}.`);
        }
        const properties = grouped.get(localTimeUs) ?? new Set<CaptionTransformKeyframeProperty>();
        properties.add(property);
        grouped.set(localTimeUs, properties);
      }
    }
  } finally {
    caption.setCurrentKeyFrameTime(-1);
  }
  return [...grouped]
    .sort(([left], [right]) => left - right)
    .map(([localTimeUs, properties]) => ({ localTimeUs, properties: [...properties] }));
}
