import { readCaptionFormatting, formatCaption, type CaptionFormatting } from './caption-formatting';
import {
  type CaptionTransformKeyframe,
  readGroupedCaptionTransformKeyframeTimes,
  setCaptionTransformKeyframes,
} from './caption-keyframes';
import { addModularCaption, type ModularCaptionPackages } from './modular-caption';

export interface ModularCaptionSnapshot {
  text: string;
  inPointUs: number;
  durationUs: number;
  packages: ModularCaptionPackages;
  formatting: CaptionFormatting;
  translation: NvsPointF;
  scaleX: number;
  scaleY: number;
  rotationZ: number;
  transformKeyframes: CaptionTransformKeyframe[];
}

export function snapshotModularCaption(caption: NvsTimelineCaption): ModularCaptionSnapshot {
  if (!caption.isModular()) throw new Error('Do not snapshot a normal caption as modular.');
  const contextId = caption.getModularCaptionContextPackageId();
  const rendererId = caption.getModularCaptionRendererPackageId();
  const periodAnimationId = caption.getModularCaptionAnimationPackageId();
  const inAnimationId = caption.getModularCaptionInAnimationPackageId();
  const outAnimationId = caption.getModularCaptionOutAnimationPackageId();
  if (periodAnimationId && (inAnimationId || outAnimationId)) {
    throw new Error('The modular caption contains conflicting period and in/out animation packages.');
  }
  const transformKeyframes = readGroupedCaptionTransformKeyframeTimes(caption).map(
    ({ localTimeUs, properties }): CaptionTransformKeyframe => {
      try {
        caption.setCurrentKeyFrameTime(localTimeUs);
        return {
          localTimeUs,
          translation: properties.includes('position') ? caption.getCaptionTranslation() : undefined,
          scaleX: properties.includes('scale') ? caption.getScaleX() : undefined,
          scaleY: properties.includes('scale') ? caption.getScaleY() : undefined,
          rotationZ: properties.includes('rotation') ? caption.getRotationZ() : undefined,
        };
      } finally {
        caption.setCurrentKeyFrameTime(-1);
      }
    },
  );
  return {
    text: caption.getText(),
    inPointUs: caption.getInPoint(),
    durationUs: caption.getOutPoint() - caption.getInPoint(),
    packages: {
      context: contextId ? { id: contextId, type: NvsAssetPackageTypeEnum.CaptionContext } : undefined,
      renderer: rendererId ? { id: rendererId, type: NvsAssetPackageTypeEnum.CaptionRenderer } : undefined,
      periodAnimation: periodAnimationId
        ? { id: periodAnimationId, type: NvsAssetPackageTypeEnum.CaptionAnimation }
        : undefined,
      periodMs: periodAnimationId ? caption.getModularCaptionAnimationPeroid() : undefined,
      inAnimation: inAnimationId
        ? { id: inAnimationId, type: NvsAssetPackageTypeEnum.CaptionAnimation }
        : undefined,
      inDurationMs: inAnimationId ? caption.getModularCaptionInAnimationDuration() : undefined,
      outAnimation: outAnimationId
        ? { id: outAnimationId, type: NvsAssetPackageTypeEnum.CaptionAnimation }
        : undefined,
      outDurationMs: outAnimationId ? caption.getModularCaptionOutAnimationDuration() : undefined,
    },
    formatting: readCaptionFormatting(caption),
    translation: caption.getCaptionTranslation(),
    scaleX: caption.getScaleX(),
    scaleY: caption.getScaleY(),
    rotationZ: caption.getRotationZ(),
    transformKeyframes,
  };
}

export async function restoreModularCaption(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  snapshot: ModularCaptionSnapshot,
): Promise<NvsTimelineCaption> {
  const caption = await addModularCaption(
    context,
    timeline,
    snapshot.text,
    snapshot.inPointUs,
    snapshot.durationUs,
    snapshot.packages,
  );
  try {
    // Package application can initialize defaults. Restore editor-owned values afterwards.
    await formatCaption(context, caption, snapshot.formatting);
    caption.setCaptionTranslation(snapshot.translation);
    caption.setScaleX(snapshot.scaleX);
    caption.setScaleY(snapshot.scaleY);
    caption.setRotationZ(snapshot.rotationZ);
    setCaptionTransformKeyframes(caption, snapshot.transformKeyframes);
    return caption;
  } catch (error) {
    timeline.removeCaption(caption);
    throw error;
  }
}
