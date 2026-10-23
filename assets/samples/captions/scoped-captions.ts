import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface ScopedCaptionInput {
  text: string;
  localInPointUs: number;
  durationUs: number;
  stylePackage?: AssetPackageRef;
}

function validateInput(input: ScopedCaptionInput, ownerDurationUs: number): void {
  if (!input.text || input.localInPointUs < 0 || input.durationUs <= 0) {
    throw new Error('Caption text, non-negative local in-point, and positive duration are required.');
  }
  if (input.localInPointUs + input.durationUs > ownerDurationUs) {
    throw new Error('Caption range exceeds its clip or track owner.');
  }
}

export async function addClipCaption(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  input: ScopedCaptionInput,
): Promise<{ caption: NvsClipCaption; remove(): Promise<void> }> {
  validateInput(input, clip.getOutPoint() - clip.getInPoint());
  if (input.stylePackage) requireReadyAssetPackage(context, input.stylePackage, 'clip caption style package');
  await context.streamingEngineReadyForTimelineModification();
  const caption = clip.addCaption(input.text, input.localInPointUs, input.durationUs, input.stylePackage?.id ?? '', false);
  if (!caption) throw new Error('The SDK could not add the clip caption.');
  return {
    caption,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      clip.removeCaption(caption);
    },
  };
}

export async function addTrackCaption(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  input: ScopedCaptionInput,
): Promise<{ caption: NvsTrackCaption; remove(): Promise<void> }> {
  validateInput(input, track.getDuration());
  if (input.stylePackage) requireReadyAssetPackage(context, input.stylePackage, 'track caption style package');
  await context.streamingEngineReadyForTimelineModification();
  const caption = track.addCaption(input.text, input.localInPointUs, input.durationUs, input.stylePackage?.id ?? '', false);
  if (!caption) throw new Error('The SDK could not add the track caption.');
  return {
    caption,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      track.removeCaption(caption);
    },
  };
}
