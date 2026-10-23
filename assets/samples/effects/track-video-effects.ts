import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export type TrackVideoEffectInput =
  | { kind: 'builtin'; name: string; inPointUs: number; durationUs: number }
  | { kind: 'packaged'; packageRef: AssetPackageRef; inPointUs: number; durationUs: number };

export async function addTrackVideoEffect(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  input: TrackVideoEffectInput,
  configure?: (effect: NvsTrackVideoFx) => void,
): Promise<{ effect: NvsTrackVideoFx; remove(): Promise<void> }> {
  if (input.inPointUs < 0 || input.durationUs <= 0) {
    throw new Error('Track effect in-point must be non-negative and duration must be positive.');
  }
  if (input.inPointUs >= track.getDuration()) {
    throw new Error('Track effect in-point must be inside a non-empty track.');
  }
  if (input.kind === 'builtin' && !input.name) throw new Error('Provide a documented built-in effect name.');
  if (input.kind === 'packaged') requireReadyAssetPackage(context, input.packageRef, 'track video effect package');
  await context.streamingEngineReadyForTimelineModification();
  const effect = input.kind === 'builtin'
    ? track.addBuiltinTrackVideoFx(input.inPointUs, input.durationUs, input.name)
    : track.addPackagedTrackVideoFx(input.inPointUs, input.durationUs, input.packageRef.id);
  if (!effect) throw new Error('The SDK could not add the track video effect.');
  try {
    configure?.(effect);
  } catch (error) {
    track.removeTrackVideoFx(effect);
    throw error;
  }
  return {
    effect,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      track.removeTrackVideoFx(effect);
    },
  };
}
