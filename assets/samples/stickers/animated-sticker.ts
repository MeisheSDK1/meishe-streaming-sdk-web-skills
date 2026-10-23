import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface AnimatedStickerOptions {
  inPointUs: number;
  durationUs: number;
  /** Required for both normal and custom-image stickers. */
  packageRef: AssetPackageRef;
  customImagePath?: string;
  translation?: NvsPointF;
  scaleX?: number;
  scaleY?: number;
  rotationZ?: number;
  opacity?: number;
  horizontalFlip?: boolean;
  verticalFlip?: boolean;
  zValue?: number;
  audioVolume?: { left: number; right: number };
  periodAnimation?: AssetPackageRef;
  periodMs?: number;
  inAnimation?: AssetPackageRef;
  inDurationMs?: number;
  outAnimation?: AssetPackageRef;
  outDurationMs?: number;
}

export async function addAnimatedSticker(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  options: AnimatedStickerOptions,
): Promise<{ sticker: NvsTimelineAnimatedSticker; remove(): Promise<void> }> {
  if (options.inPointUs < 0 || options.durationUs <= 0) {
    throw new Error('Sticker in-point must be non-negative and duration must be positive.');
  }
  if (options.inPointUs >= timeline.getDuration()) {
    throw new Error('Sticker in-point must be inside a non-empty timeline.');
  }
  if (options.periodAnimation && (options.inAnimation || options.outAnimation)) {
    throw new Error('Choose either a period animation or in/out animations, not both.');
  }
  if ((options.periodMs ?? 1) <= 0 || (options.inDurationMs ?? 0) < 0 || (options.outDurationMs ?? 0) < 0) {
    throw new Error('Animation periods must be positive and in/out durations cannot be negative.');
  }
  const custom = Boolean(options.customImagePath);
  requireReadyAssetPackage(context, options.packageRef, 'animated-sticker package');
  if (options.customImagePath && !FS.analyzePath(options.customImagePath).exists) {
    throw new Error(`[missing-external] Provide the custom sticker image in SDK FS: ${options.customImagePath}`);
  }
  if (options.periodAnimation) {
    requireReadyAssetPackage(context, options.periodAnimation, 'sticker period-animation package');
  }
  if (options.inAnimation) {
    requireReadyAssetPackage(context, options.inAnimation, 'sticker in-animation package');
  }
  if (options.outAnimation) {
    requireReadyAssetPackage(context, options.outAnimation, 'sticker out-animation package');
  }
  await context.streamingEngineReadyForTimelineModification();
  const sticker = timeline.addAnimatedSticker(
    options.inPointUs,
    options.durationUs,
    options.packageRef.id,
    false,
    custom,
    options.customImagePath ?? '',
  );
  if (!sticker) throw new Error('The SDK could not add the animated sticker.');
  const fail = (message: string): never => {
    timeline.removeAnimatedSticker(sticker);
    throw new Error(message);
  };

  if (options.translation) sticker.setTranslation(options.translation);
  if (options.scaleX !== undefined) sticker.setSeperatedScaleX(options.scaleX);
  if (options.scaleY !== undefined) sticker.setSeperatedScaleY(options.scaleY);
  if (options.rotationZ !== undefined) sticker.setRotationZ(options.rotationZ);
  if (options.opacity !== undefined) sticker.setOpacity(options.opacity);
  if (options.horizontalFlip !== undefined) sticker.setHorizontalFlip(options.horizontalFlip);
  if (options.verticalFlip !== undefined) sticker.setVerticalFlip(options.verticalFlip);
  if (options.zValue !== undefined) sticker.setZValue(options.zValue);
  if (options.audioVolume) sticker.setVolumeGain(options.audioVolume.left, options.audioVolume.right);
  if (options.periodAnimation) {
    if (!sticker.applyAnimatedStickerPeriodAnimation(options.periodAnimation.id)) {
      fail('The installed sticker period animation could not be applied.');
    }
    sticker.setAnimatedStickerAnimationPeriod(
      Math.min(options.periodMs ?? 1000, options.durationUs / 1000),
    );
  } else {
    const ownerDurationMs = options.durationUs / 1000;
    const inDurationMs = Math.min(options.inDurationMs ?? 500, ownerDurationMs);
    const outDurationMs = Math.min(
      options.outDurationMs ?? 500,
      Math.max(0, ownerDurationMs - (options.inAnimation ? inDurationMs : 0)),
    );
    if (options.inAnimation) {
      if (!sticker.applyAnimatedStickerInAnimation(options.inAnimation.id)) {
        fail('The installed sticker in-animation could not be applied.');
      }
      sticker.setAnimatedStickerOutAnimationDuration(0);
      sticker.setAnimatedStickerInAnimationDuration(inDurationMs);
    }
    if (options.outAnimation) {
      if (!sticker.applyAnimatedStickerOutAnimation(options.outAnimation.id)) {
        fail('The installed sticker out-animation could not be applied.');
      }
      sticker.setAnimatedStickerOutAnimationDuration(outDurationMs);
    }
  }
  return {
    sticker,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      // The return value is the next sticker, not a success flag.
      timeline.removeAnimatedSticker(sticker);
    },
  };
}
