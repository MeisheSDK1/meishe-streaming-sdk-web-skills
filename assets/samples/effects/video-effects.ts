import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export type TimelineEffectRequest =
  | { kind: 'builtin'; name: string; inPointUs: number; durationUs: number }
  | { kind: 'packaged'; packageRef: AssetPackageRef; inPointUs: number; durationUs: number };

export interface VideoEffectPresentation {
  intensity?: number;
  absoluteTime?: boolean;
  regional?: boolean;
  inverseRegion?: boolean;
  ignoreBackground?: boolean;
  featherWidth?: number;
  zValue?: number;
}

type PresentableVideoEffect = NvsFx & {
  setAbsoluteTimeUsed?(enabled: boolean): void;
  setZValue?(zValue: number): void;
};

export function configureVideoEffectPresentation(
  effect: PresentableVideoEffect,
  options: VideoEffectPresentation,
): void {
  if ((options.intensity ?? 0) < 0 || (options.featherWidth ?? 0) < 0) {
    throw new Error('Effect intensity and regional feather width cannot be negative.');
  }
  if (options.intensity !== undefined) effect.setFilterIntensity(options.intensity);
  if (options.absoluteTime !== undefined) {
    if (!effect.setAbsoluteTimeUsed) throw new Error('This effect owner does not support absolute-time parameters.');
    effect.setAbsoluteTimeUsed(options.absoluteTime);
  }
  if (options.regional !== undefined) effect.setRegional(options.regional);
  if (options.inverseRegion !== undefined) effect.setInverseRegion(options.inverseRegion);
  if (options.ignoreBackground !== undefined) effect.setIgnoreBackground(options.ignoreBackground);
  if (options.featherWidth !== undefined) effect.setRegionalFeatherWidth(options.featherWidth);
  if (options.zValue !== undefined) {
    if (!effect.setZValue) throw new Error('This effect owner does not support Z-value ordering.');
    effect.setZValue(options.zValue);
  }
}

export async function addTimelineVideoEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  request: TimelineEffectRequest,
  configure?: (effect: NvsTimelineVideoFx) => void,
): Promise<{ effect: NvsTimelineVideoFx; remove(): Promise<void> }> {
  if (request.inPointUs < 0 || request.durationUs <= 0) {
    throw new Error('Timeline effect in-point must be non-negative and duration must be positive.');
  }
  if (request.inPointUs >= timeline.getDuration()) {
    throw new Error('Timeline effect in-point must be inside a non-empty timeline.');
  }
  await context.streamingEngineReadyForTimelineModification();
  let effect: NvsTimelineVideoFx;
  if (request.kind === 'builtin') {
    if (!request.name) throw new Error('Provide a documented built-in effect name.');
    effect = timeline.addBuiltinTimelineVideoFx(request.inPointUs, request.durationUs, request.name);
  } else {
    requireReadyAssetPackage(context, request.packageRef, 'video effect package');
    effect = timeline.addPackagedTimelineVideoFx(
      request.inPointUs,
      request.durationUs,
      request.packageRef.id,
    );
  }
  if (!effect) throw new Error('The SDK could not add the timeline video effect.');
  try {
    configure?.(effect);
  } catch (error) {
    timeline.removeTimelineVideoFx(effect);
    throw error;
  }
  return {
    effect,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      // The return value is the next effect, not a success flag.
      timeline.removeTimelineVideoFx(effect);
    },
  };
}

export async function addClipVideoEffect(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  request:
    | { kind: 'builtin'; name: string; raw?: boolean; inPointUs?: number; durationUs?: number }
    | { kind: 'packaged'; packageRef: AssetPackageRef; raw?: boolean; inPointUs?: number; durationUs?: number },
  configure?: (effect: NvsVideoFx) => void,
): Promise<{ effect: NvsVideoFx; remove(): Promise<void> }> {
  if (request.kind === 'builtin' && !request.name) {
    throw new Error('Provide a documented built-in effect name.');
  }
  if (request.kind === 'packaged') {
    requireReadyAssetPackage(context, request.packageRef, 'clip video effect package');
  }
  await context.streamingEngineReadyForTimelineModification();
  if ((request.inPointUs ?? 0) < 0 || (request.durationUs !== undefined && request.durationUs <= 0)) {
    throw new Error('Clip effect offset must be non-negative and duration must be positive.');
  }
  const args = request.durationUs === undefined
    ? [] as const
    : [request.inPointUs ?? 0, request.durationUs] as const;
  const effect = request.kind === 'builtin'
    ? request.raw
      ? clip.appendRawBuiltinFx(request.name, ...args)
      : clip.appendBuiltinFx(request.name, ...args)
    : request.raw
      ? clip.appendRawPackagedFx(request.packageRef.id, ...args)
      : clip.appendPackagedFx(request.packageRef.id, ...args);
  if (!effect) throw new Error('The SDK could not add the clip video effect.');
  const removeEffect = () => request.raw
    ? clip.removeRawFx(effect.getIndex())
    : clip.removeFx(effect.getIndex());
  try {
    configure?.(effect);
  } catch (error) {
    removeEffect();
    throw error;
  }
  return {
    effect,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      if (!removeEffect()) throw new Error('The SDK could not remove the clip effect.');
    },
  };
}
