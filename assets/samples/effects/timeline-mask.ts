import {
  createMaskRegionFromPlane,
  MaskShape,
  setMaskRegions,
} from './mask-region-io';

export interface TimelineMaskResolution {
  width: number;
  height: number;
}

export interface TimelineMaskShapeOptions {
  resolution: TimelineMaskResolution;
  /** Center in timeline canonical coordinates: origin at timeline center, Y up. */
  center?: NvsPointF;
  horizontalScale?: number;
  verticalScale?: number;
  cornerRadiusRate?: number;
}

export interface TimelineViewMaskShapeOptions {
  liveWindow: NvsLiveWindow;
  /** Laid-out timeline image bounds in LiveWindow view coordinates. */
  viewBox: { x: number; y: number; width: number; height: number };
  center?: NvsPointF;
  horizontalScale?: number;
  verticalScale?: number;
  cornerRadiusRate?: number;
}

function assertResolution(resolution: TimelineMaskResolution): void {
  if (
    ![resolution.width, resolution.height].every(Number.isFinite) ||
    resolution.width <= 0 || resolution.height <= 0
  ) {
    throw new Error('Timeline mask resolution must be finite and positive.');
  }
}

export function getTimelineMaskResolution(timeline: NvsTimeline): TimelineMaskResolution {
  const resolution = timeline.getVideoRes();
  const result = { width: Number(resolution.imageWidth), height: Number(resolution.imageHeight) };
  assertResolution(result);
  return result;
}

export function mapTimelineCoordinateToMaskNdc(
  point: NvsPointF,
  resolution: TimelineMaskResolution,
): NvsPointF {
  assertResolution(resolution);
  // Timeline-owned effects use the timeline center as origin and canonical Y up.
  return new NvsPointF(point.x / (resolution.width / 2), point.y / (resolution.height / 2));
}

export function mapTimelineMaskNdcToCoordinate(
  point: NvsPointF,
  resolution: TimelineMaskResolution,
): NvsPointF {
  assertResolution(resolution);
  return new NvsPointF(point.x * (resolution.width / 2), point.y * (resolution.height / 2));
}

export function mapTimelineViewToMaskNdc(liveWindow: NvsLiveWindow, point: NvsPointF): NvsPointF {
  return liveWindow.mapViewToNormalized(point);
}

export function mapTimelineMaskNdcToView(liveWindow: NvsLiveWindow, point: NvsPointF): NvsPointF {
  return liveWindow.mapNormalizedToView(point);
}

export function createTimelineMaskRegion(
  shape: MaskShape,
  options: TimelineMaskShapeOptions,
): NvsRegionInfo {
  assertResolution(options.resolution);
  const horizontalScale = options.horizontalScale ?? 1;
  const verticalScale = options.verticalScale ?? 1;
  if (horizontalScale <= 0 || verticalScale <= 0) throw new Error('Mask shape scales must be positive.');
  const base = Math.min(options.resolution.width, options.resolution.height) / 2;
  return createMaskRegionFromPlane(shape, {
    center: options.center ?? new NvsPointF(0, 0),
    width: shape === 'line' ? options.resolution.width : base * horizontalScale,
    height: shape === 'line' ? options.resolution.height : base * verticalScale,
    cornerRadiusRate: options.cornerRadiusRate,
    yAxis: 'up',
    mapPointToNdc: (point) => mapTimelineCoordinateToMaskNdc(point, options.resolution),
  });
}

export function createTimelineMaskRegionFromView(
  shape: MaskShape,
  options: TimelineViewMaskShapeOptions,
): NvsRegionInfo {
  const { viewBox } = options;
  if (![viewBox.x, viewBox.y, viewBox.width, viewBox.height].every(Number.isFinite) || viewBox.width <= 0 || viewBox.height <= 0) {
    throw new Error('Timeline view box must be finite and positive.');
  }
  const horizontalScale = options.horizontalScale ?? 1;
  const verticalScale = options.verticalScale ?? 1;
  if (horizontalScale <= 0 || verticalScale <= 0) throw new Error('Mask shape scales must be positive.');
  const base = Math.min(viewBox.width, viewBox.height) / 2;
  return createMaskRegionFromPlane(shape, {
    center: options.center ?? new NvsPointF(viewBox.x + viewBox.width / 2, viewBox.y + viewBox.height / 2),
    width: shape === 'line' ? viewBox.width : base * horizontalScale,
    height: shape === 'line' ? viewBox.height : base * verticalScale,
    cornerRadiusRate: options.cornerRadiusRate,
    yAxis: 'down',
    mapPointToNdc: (point) => mapTimelineViewToMaskNdc(options.liveWindow, point),
  });
}

export async function addTimelineMaskEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  inPointUs: number,
  durationUs: number,
  builtinName: string,
  region: NvsRegionInfo,
  options: { inverse?: boolean; featherWidth?: number; ignoreBackground?: boolean } = {},
): Promise<NvsTimelineVideoFx> {
  if (inPointUs < 0 || durationUs <= 0) throw new Error('Timeline mask range is invalid.');
  if (!builtinName.trim()) throw new Error('Provide a verified regional built-in effect name.');
  const featherWidth = options.featherWidth ?? 0;
  if (!Number.isFinite(featherWidth) || featherWidth < 0) {
    throw new Error('Regional feather width must be a non-negative finite number.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const effect = timeline.addBuiltinTimelineVideoFx(inPointUs, durationUs, builtinName);
  if (!effect) throw new Error(`The SDK could not add the built-in ${builtinName} timeline effect.`);
  try {
    effect.setRegional(true);
    effect.setIgnoreBackground(options.ignoreBackground ?? true);
    effect.setInverseRegion(options.inverse ?? false);
    effect.setRegionalFeatherWidth(featherWidth);
    await setMaskRegions(context, effect, [region]);
    return effect;
  } catch (error) {
    timeline.removeTimelineVideoFx(effect);
    throw error;
  }
}

export async function setTimelineObjectMaskRegion(
  context: NvsStreamingContext,
  owner: NvsTimelineVideoFx | NvsTimelineCaption,
  region: NvsRegionInfo,
  /** Time relative to the timeline effect/caption in-point, in microseconds. */
  localTimeUs?: number,
): Promise<void> {
  if (!(owner instanceof NvsTimelineVideoFx) && !(owner instanceof NvsTimelineCaption)) {
    throw new Error('Expected an NvsTimelineVideoFx or NvsTimelineCaption owner.');
  }
  owner.setRegional(true);
  owner.setIgnoreBackground(true);
  await setMaskRegions(context, owner, [region], localTimeUs);
}
