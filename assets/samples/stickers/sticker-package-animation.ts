import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export type StickerPackageAnimation =
  | { mode: 'period'; packageRef: AssetPackageRef; periodMs?: number }
  | {
      mode: 'in-out';
      inAnimation?: AssetPackageRef;
      inDurationMs?: number;
      outAnimation?: AssetPackageRef;
      outDurationMs?: number;
    };

function clearStickerAnimations(sticker: NvsTimelineAnimatedSticker): void {
  sticker.applyAnimatedStickerInAnimation('');
  sticker.setAnimatedStickerInAnimationDuration(0);
  sticker.applyAnimatedStickerOutAnimation('');
  sticker.setAnimatedStickerOutAnimationDuration(0);
  sticker.applyAnimatedStickerPeriodAnimation('');
  sticker.setAnimatedStickerAnimationPeriod(0);
}

export async function setStickerPackageAnimation(
  context: NvsStreamingContext,
  sticker: NvsTimelineAnimatedSticker,
  animation?: StickerPackageAnimation,
): Promise<void> {
  const ownerDurationMs = (sticker.getOutPoint() - sticker.getInPoint()) / 1000;
  if (ownerDurationMs <= 0) throw new Error('The sticker duration must be positive.');

  if (animation?.mode === 'period') {
    requireReadyAssetPackage(context, animation.packageRef, 'sticker period-animation package');
    const periodMs = animation.periodMs ?? ownerDurationMs;
    if (periodMs <= 0 || periodMs > ownerDurationMs) {
      throw new Error('Sticker animation period must be inside the sticker duration.');
    }
  } else if (animation) {
    if (!animation.inAnimation && !animation.outAnimation) {
      throw new Error('Provide a sticker in-animation and/or out-animation package.');
    }
    if (animation.inAnimation) {
      requireReadyAssetPackage(context, animation.inAnimation, 'sticker in-animation package');
    }
    if (animation.outAnimation) {
      requireReadyAssetPackage(context, animation.outAnimation, 'sticker out-animation package');
    }
    const inDurationMs = animation.inAnimation ? animation.inDurationMs ?? Math.min(500, ownerDurationMs) : 0;
    const outDurationMs = animation.outAnimation
      ? animation.outDurationMs ?? Math.min(500, ownerDurationMs - inDurationMs)
      : 0;
    if (inDurationMs < 0 || outDurationMs < 0 || inDurationMs + outDurationMs > ownerDurationMs) {
      throw new Error('Sticker in/out animation durations must not overlap or exceed the sticker duration.');
    }
  }

  await context.streamingEngineReadyForTimelineModification();
  clearStickerAnimations(sticker);
  if (!animation) return;

  if (animation.mode === 'period') {
    if (!sticker.applyAnimatedStickerPeriodAnimation(animation.packageRef.id)) {
      throw new Error('The installed sticker period-animation package could not be applied.');
    }
    sticker.setAnimatedStickerAnimationPeriod(animation.periodMs ?? ownerDurationMs);
    return;
  }

  const inDurationMs = animation.inAnimation ? animation.inDurationMs ?? Math.min(500, ownerDurationMs) : 0;
  const outDurationMs = animation.outAnimation
    ? animation.outDurationMs ?? Math.min(500, ownerDurationMs - inDurationMs)
    : 0;
  if (animation.inAnimation) {
    if (!sticker.applyAnimatedStickerInAnimation(animation.inAnimation.id)) {
      clearStickerAnimations(sticker);
      throw new Error('The installed sticker in-animation package could not be applied.');
    }
    sticker.setAnimatedStickerInAnimationDuration(inDurationMs);
  }
  if (animation.outAnimation) {
    if (!sticker.applyAnimatedStickerOutAnimation(animation.outAnimation.id)) {
      clearStickerAnimations(sticker);
      throw new Error('The installed sticker out-animation package could not be applied.');
    }
    sticker.setAnimatedStickerOutAnimationDuration(outDurationMs);
  }
}
