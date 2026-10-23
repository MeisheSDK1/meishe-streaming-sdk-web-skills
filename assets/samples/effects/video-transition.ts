import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export type VideoTransitionRequest =
  | { kind: 'builtin'; name: string }
  | { kind: 'packaged'; packageRef: AssetPackageRef };

export async function setVideoTransition(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  sourceClip: NvsVideoClip,
  durationUs: number,
  matchMode: number,
  request: VideoTransitionRequest,
): Promise<NvsVideoTransition> {
  if (durationUs <= 0) throw new Error('Transition duration must be positive.');
  const sourceClipIndex = sourceClip.getIndex();
  const nextClip = track.getClipByIndex(sourceClipIndex + 1);
  if (
    sourceClipIndex < 0 ||
    sourceClipIndex >= track.getClipCount() - 1 ||
    track.getClipByIndex(sourceClipIndex)?.getInternalObject() !== sourceClip.getInternalObject() ||
    !nextClip
  ) {
    throw new Error('The source clip must belong to this track and have an adjacent next clip.');
  }
  if (sourceClip.getOutPoint() !== nextClip.getInPoint()) {
    throw new Error('A video transition requires two clips sharing a gapless Timeline boundary.');
  }
  await context.streamingEngineReadyForTimelineModification();
  let transition: NvsVideoTransition;
  if (request.kind === 'builtin') {
    if (!request.name) throw new Error('Provide a documented built-in transition name.');
    transition = track.setBuiltinTransition(sourceClipIndex, request.name);
  } else {
    requireReadyAssetPackage(context, request.packageRef, 'video transition package');
    transition = track.setPackagedTransition(sourceClipIndex, request.packageRef.id);
  }
  if (!transition) {
    throw new Error('The SDK could not create the transition; verify adjacent clips and identifiers.');
  }
  transition.setVideoTransitionDuration(durationUs, matchMode);
  const installed = track.getTransitionBySourceClipIndex(sourceClipIndex);
  if (!installed || installed.getInternalObject() !== transition.getInternalObject() || installed.getVideoTransitionDuration() <= 0) {
    throw new Error('The SDK did not retain a valid transition at the requested boundary.');
  }
  if (request.kind === 'packaged' && installed.getVideoTransitionPackageId() !== request.packageRef.id) {
    throw new Error('The installed transition package ID does not match the requested package.');
  }
  return installed;
}

export async function removeVideoTransition(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  sourceClipIndex: number,
): Promise<void> {
  if (sourceClipIndex < 0 || sourceClipIndex >= track.getClipCount() - 1) {
    throw new Error('A transition source index must identify a clip followed by another clip.');
  }
  await context.streamingEngineReadyForTimelineModification();
  track.setBuiltinTransition(sourceClipIndex, '');
  if (track.getTransitionBySourceClipIndex(sourceClipIndex)) {
    throw new Error('The SDK did not remove the transition at the requested boundary.');
  }
}
