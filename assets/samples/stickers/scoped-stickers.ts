import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface ScopedStickerInput {
  localInPointUs: number;
  durationUs: number;
  packageRef: AssetPackageRef;
  customImagePath?: string;
}

function validateInput(input: ScopedStickerInput, ownerDurationUs: number): void {
  if (input.localInPointUs < 0 || input.durationUs <= 0) {
    throw new Error('Sticker local in-point must be non-negative and duration must be positive.');
  }
  if (input.localInPointUs + input.durationUs > ownerDurationUs) {
    throw new Error('Sticker range exceeds its clip or track owner.');
  }
}

export async function addClipSticker(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  input: ScopedStickerInput,
): Promise<{ sticker: NvsClipAnimatedSticker; remove(): Promise<void> }> {
  validateInput(input, clip.getOutPoint() - clip.getInPoint());
  requireReadyAssetPackage(context, input.packageRef, 'clip animated-sticker package');
  if (input.customImagePath && !FS.analyzePath(input.customImagePath).exists) {
    throw new Error(`[missing-external] Provide the custom sticker image in SDK FS: ${input.customImagePath}`);
  }
  await context.streamingEngineReadyForTimelineModification();
  const sticker = clip.addAnimatedSticker(
    input.localInPointUs,
    input.durationUs,
    input.packageRef.id,
    false,
    Boolean(input.customImagePath),
    input.customImagePath ?? '',
  );
  if (!sticker) throw new Error('The SDK could not add the clip sticker.');
  return {
    sticker,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      clip.removeAnimatedSticker(sticker);
    },
  };
}

export async function addTrackSticker(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  input: ScopedStickerInput,
): Promise<{ sticker: NvsTrackAnimatedSticker; remove(): Promise<void> }> {
  validateInput(input, track.getDuration());
  requireReadyAssetPackage(context, input.packageRef, 'track animated-sticker package');
  if (input.customImagePath && !FS.analyzePath(input.customImagePath).exists) {
    throw new Error(`[missing-external] Provide the custom sticker image in SDK FS: ${input.customImagePath}`);
  }
  await context.streamingEngineReadyForTimelineModification();
  const sticker = track.addAnimatedSticker(
    input.localInPointUs,
    input.durationUs,
    input.packageRef.id,
    false,
    Boolean(input.customImagePath),
    input.customImagePath ?? '',
  );
  if (!sticker) throw new Error('The SDK could not add the track sticker.');
  return {
    sticker,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      track.removeAnimatedSticker(sticker);
    },
  };
}
