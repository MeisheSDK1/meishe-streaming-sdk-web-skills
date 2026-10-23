import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export type CaptionPackageAnimation =
  | { mode: 'period'; packageRef: AssetPackageRef; periodMs?: number }
  | {
      mode: 'in-out';
      inAnimation?: AssetPackageRef;
      inDurationMs?: number;
      outAnimation?: AssetPackageRef;
      outDurationMs?: number;
    };

function clearCaptionAnimations(caption: NvsTimelineCaption): void {
  caption.applyModularCaptionInAnimation('');
  caption.setModularCaptionInAnimationDuration(0);
  caption.applyModularCaptionOutAnimation('');
  caption.setModularCaptionOutAnimationDuration(0);
  caption.applyModularCaptionAnimation('');
  caption.setModularCaptionAnimationPeroid(0);
}

export async function setCaptionPackageAnimation(
  context: NvsStreamingContext,
  caption: NvsTimelineCaption,
  animation?: CaptionPackageAnimation,
): Promise<void> {
  const ownerDurationMs = (caption.getOutPoint() - caption.getInPoint()) / 1000;
  if (ownerDurationMs <= 0) throw new Error('The caption duration must be positive.');

  if (animation?.mode === 'period') {
    requireReadyAssetPackage(context, animation.packageRef, 'caption period-animation package');
    const periodMs = animation.periodMs ?? ownerDurationMs;
    if (periodMs <= 0 || periodMs > ownerDurationMs) {
      throw new Error('Caption animation period must be inside the caption duration.');
    }
  } else if (animation) {
    if (!animation.inAnimation && !animation.outAnimation) {
      throw new Error('Provide a caption in-animation and/or out-animation package.');
    }
    if (animation.inAnimation) {
      requireReadyAssetPackage(context, animation.inAnimation, 'caption in-animation package');
    }
    if (animation.outAnimation) {
      requireReadyAssetPackage(context, animation.outAnimation, 'caption out-animation package');
    }
    const inDurationMs = animation.inAnimation ? animation.inDurationMs ?? Math.min(500, ownerDurationMs) : 0;
    const outDurationMs = animation.outAnimation
      ? animation.outDurationMs ?? Math.min(500, ownerDurationMs - inDurationMs)
      : 0;
    if (inDurationMs < 0 || outDurationMs < 0 || inDurationMs + outDurationMs > ownerDurationMs) {
      throw new Error('Caption in/out animation durations must not overlap or exceed the caption duration.');
    }
  }

  await context.streamingEngineReadyForTimelineModification();
  clearCaptionAnimations(caption);
  if (!animation) return;

  if (animation.mode === 'period') {
    if (!caption.applyModularCaptionAnimation(animation.packageRef.id)) {
      throw new Error('The installed caption period-animation package could not be applied.');
    }
    caption.setModularCaptionAnimationPeroid(animation.periodMs ?? ownerDurationMs);
    return;
  }

  const inDurationMs = animation.inAnimation ? animation.inDurationMs ?? Math.min(500, ownerDurationMs) : 0;
  const outDurationMs = animation.outAnimation
    ? animation.outDurationMs ?? Math.min(500, ownerDurationMs - inDurationMs)
    : 0;
  if (animation.inAnimation) {
    if (!caption.applyModularCaptionInAnimation(animation.inAnimation.id)) {
      clearCaptionAnimations(caption);
      throw new Error('The installed caption in-animation package could not be applied.');
    }
    caption.setModularCaptionInAnimationDuration(inDurationMs);
  }
  if (animation.outAnimation) {
    if (!caption.applyModularCaptionOutAnimation(animation.outAnimation.id)) {
      clearCaptionAnimations(caption);
      throw new Error('The installed caption out-animation package could not be applied.');
    }
    caption.setModularCaptionOutAnimationDuration(outDurationMs);
  }
}
