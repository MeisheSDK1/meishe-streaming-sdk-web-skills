export type MaskShape = 'line' | 'mirror' | 'ellipse' | 'rectangle' | 'rounded-rectangle' | 'heart' | 'star';

export interface PlaneMaskShapeOptions {
  /** Center and size in one caller-selected plane. This helper does not choose the coordinate space. */
  center: NvsPointF;
  width: number;
  height: number;
  yAxis: 'up' | 'down';
  mapPointToNdc(point: NvsPointF): NvsPointF;
  cornerRadiusRate?: number;
}

interface ReadableVector<T> {
  size(): number;
  get(index: number): T;
}

function initializeRegion(): NvsRegionInfo {
  const region = new NvsRegionInfo();
  region.anchorX = 0;
  region.anchorY = 0;
  region.scaleX = 1;
  region.scaleY = 1;
  region.rotation = 0;
  region.translationX = 0;
  region.translationY = 0;
  return region;
}

function setPointRegion(
  type: 'polygon' | 'cubicCurve',
  points: NvsPointF[],
  mapPointToNdc: (point: NvsPointF) => NvsPointF,
): NvsRegionInfo {
  const region = initializeRegion();
  region.type = type;
  region.points = points.map(mapPointToNdc);
  return region;
}

/**
 * Low-level geometry helper. Call it through video-mask.ts or timeline-mask.ts
 * so the mapper and Y-axis convention cannot be selected by inference.
 */
export function createMaskRegionFromPlane(
  shape: MaskShape,
  options: PlaneMaskShapeOptions,
): NvsRegionInfo {
  const { center, width, height, mapPointToNdc } = options;
  if (![center.x, center.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Mask center and size must be finite, with a positive size.');
  }
  const down = options.yAxis === 'down' ? 1 : -1;
  const mappedCenter = mapPointToNdc(center);

  if (shape === 'mirror') {
    const region = initializeRegion();
    region.type = 'mirror';
    region.theta = 0;
    region.distance = 0.5;
    region.center = mappedCenter;
    return region;
  }
  if (shape === 'ellipse') {
    const region = initializeRegion();
    const edgeX = mapPointToNdc(new NvsPointF(center.x + width / 2, center.y));
    const edgeY = mapPointToNdc(new NvsPointF(center.x, center.y + height / 2));
    region.type = 'ellipse';
    region.center = mappedCenter;
    region.a = Math.abs(edgeX.x - mappedCenter.x);
    region.b = Math.abs(edgeY.y - mappedCenter.y);
    region.theta = 0;
    return region;
  }
  if (shape === 'line') {
    return setPointRegion('polygon', [
      new NvsPointF(center.x - width * 3, center.y - down * height * 3),
      new NvsPointF(center.x - width * 3, center.y),
      new NvsPointF(center.x + width * 3, center.y),
      new NvsPointF(center.x + width * 3, center.y - down * height * 3),
    ], mapPointToNdc);
  }
  if (shape === 'heart') {
    const radiusX = width / 2;
    const radiusY = height / 2;
    return setPointRegion('cubicCurve', [
      new NvsPointF(center.x, center.y - down * radiusY * 0.75),
      new NvsPointF(center.x - radiusX * 1.15, center.y - down * radiusY * 1.5),
      new NvsPointF(center.x + radiusX * 1.15, center.y - down * radiusY * 1.5),
      new NvsPointF(center.x, center.y + down * radiusY),
      new NvsPointF(center.x + radiusX * 1.45, center.y + down * radiusY * 0.2),
      new NvsPointF(center.x - radiusX * 1.45, center.y + down * radiusY * 0.2),
    ], mapPointToNdc);
  }
  if (shape === 'star') {
    const points = Array.from({ length: 10 }, (_, index) => {
      const scale = index % 2 === 0 ? 1 : 0.5;
      const angle = -Math.PI / 2 + index * (Math.PI / 5);
      return new NvsPointF(
        center.x + (width / 2) * scale * Math.cos(angle),
        center.y + down * (height / 2) * scale * Math.sin(angle),
      );
    });
    return setPointRegion('polygon', points, mapPointToNdc);
  }

  const cornerRate = options.cornerRadiusRate ?? (shape === 'rectangle' ? 0 : 0.2);
  if (!Number.isFinite(cornerRate) || cornerRate < 0 || cornerRate > 1) {
    throw new Error('cornerRadiusRate must be a finite value in [0, 1].');
  }
  const radius = cornerRate * Math.min(width, height) * 0.5;
  const left = center.x - width / 2;
  const right = center.x + width / 2;
  const top = center.y - down * height / 2;
  const bottom = center.y + down * height / 2;
  if (cornerRate === 0) {
    return setPointRegion('polygon', [
      new NvsPointF(left, top),
      new NvsPointF(right, top),
      new NvsPointF(right, bottom),
      new NvsPointF(left, bottom),
    ], mapPointToNdc);
  }
  const control = radius * 0.45;
  const points = [
    new NvsPointF(left, top + down * radius), new NvsPointF(left, top + down * control), new NvsPointF(left, bottom - down * radius),
    new NvsPointF(left, bottom - down * radius), new NvsPointF(left, top + down * radius), new NvsPointF(left, bottom - down * control),
    new NvsPointF(left + radius, bottom), new NvsPointF(left + control, bottom), new NvsPointF(right - radius, bottom),
    new NvsPointF(right - radius, bottom), new NvsPointF(left + radius, bottom), new NvsPointF(right - control, bottom),
    new NvsPointF(right, bottom - down * radius), new NvsPointF(right, bottom - down * control), new NvsPointF(right, top + down * radius),
    new NvsPointF(right, top + down * radius), new NvsPointF(right, bottom - down * radius), new NvsPointF(right, top + down * control),
    new NvsPointF(right - radius, top), new NvsPointF(right - control, top), new NvsPointF(left + radius, top),
    new NvsPointF(left + radius, top), new NvsPointF(right - radius, top), new NvsPointF(left + control, top),
  ];
  return setPointRegion('cubicCurve', points, mapPointToNdc);
}

/**
 * SDK-level compatibility branch only. Do not select this built-in by default:
 * require an explicit user request and rendered-output evidence from the target runtime.
 */
export function isMaskGenerator(effect: NvsFx): boolean {
  if (effect instanceof NvsVideoFx) {
    return effect.getVideoFxType() === NvsVideoFxTypeEnum.Builtin && effect.getBuiltinVideoFxName() === 'Mask Generator';
  }
  if (effect instanceof NvsTimelineVideoFx) {
    return effect.getTimelineVideoFxType() === NvsVideoFxTypeEnum.Builtin && effect.getBuiltinTimelineVideoFxName() === 'Mask Generator';
  }
  return false;
}

function readPoints(region: NvsRegionInfo): NvsPointF[] {
  const source = (region as unknown as {
    points?: ReadableVector<NvsPointF | number> | Array<NvsPointF | number>;
  }).points;
  if (!source) return [];
  const values = Array.isArray(source)
    ? source
    : Array.from({ length: source.size() }, (_, index) => source.get(index));
  if (values.length > 0 && typeof values[0] === 'number') {
    const points: NvsPointF[] = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      points.push(new NvsPointF(values[index] as number, values[index + 1] as number));
    }
    return points;
  }
  return (values as NvsPointF[]).map((point) => new NvsPointF(point.x, point.y));
}

function copyRegion(region: NvsRegionInfo): NvsRegionInfo {
  const copy = new NvsRegionInfo();
  Object.assign(copy, region);
  if (region.type === 'polygon' || region.type === 'cubicCurve') copy.points = readPoints(region);
  return copy;
}

export function getMaskRegions(effect: NvsFx, localTimeUs?: number): NvsRegionInfo[] {
  if (localTimeUs !== undefined && localTimeUs < 0) throw new Error('Mask keyframe time cannot be negative.');
  if (isMaskGenerator(effect)) {
    const region = localTimeUs === undefined
      ? effect.getArbitraryVal('Region Info')
      : effect.getArbitraryValAtTime('Region Info', localTimeUs);
    return region ? [copyRegion(region)] : [];
  }
  const vector = (localTimeUs === undefined
    ? effect.getRegionInfos()
    : effect.getRegionInfosAtTime(localTimeUs)) as unknown as ReadableVector<NvsRegionInfo>;
  if (!vector) return [];
  return Array.from({ length: vector.size() }, (_, index) => copyRegion(vector.get(index)));
}

function serializeRegion(region: NvsRegionInfo): NvsRegionInfo {
  const serialized = new NvsRegionInfo();
  Object.assign(serialized, region);
  const points = readPoints(region);
  if (region.type === 'polygon') {
    const vector = new NvsVectorVal() as NvsVectorVal & { push_back(value: NvsPointF): void };
    points.forEach((point) => vector.push_back(new NvsPointF(point.x, point.y)));
    serialized.points = vector as unknown as NvsPointF[];
  } else if (region.type === 'cubicCurve') {
    const vector = new NvsVectorFloat() as NvsVectorFloat & { push_back(value: number): void };
    points.forEach((point) => {
      vector.push_back(point.x);
      vector.push_back(point.y);
    });
    serialized.points = vector as unknown as NvsPointF[];
  }
  return serialized;
}

/**
 * Writes already-normalized regions only. It intentionally performs no owner-coordinate conversion.
 * Ordinary regional effects use setRegionInfos(); Mask Generator is an explicit, runtime-verified exception.
 */
export async function setMaskRegions(
  context: NvsStreamingContext,
  effect: NvsFx,
  regions: readonly NvsRegionInfo[],
  localTimeUs?: number,
): Promise<void> {
  if (localTimeUs !== undefined && localTimeUs < 0) throw new Error('Mask keyframe time cannot be negative.');
  if (isMaskGenerator(effect) && regions.length !== 1) {
    throw new Error('Mask Generator requires exactly one NvsRegionInfo.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const serialized = regions.map(serializeRegion);
  if (isMaskGenerator(effect)) {
    if (localTimeUs === undefined) effect.setArbitraryVal('Region Info', serialized[0]);
    else effect.setArbitraryValAtTime('Region Info', serialized[0], localTimeUs);
    return;
  }
  const vector = new NvsVectorVal() as NvsVectorVal & { push_back(value: NvsRegionInfo): void };
  serialized.forEach((region) => vector.push_back(region));
  if (localTimeUs === undefined) effect.setRegionInfos(vector);
  else effect.setRegionInfosAtTime(vector, localTimeUs);
}

export interface MaskRegionTransform {
  translationX?: number;
  translationY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export async function setFirstMaskRegionTransform(
  context: NvsStreamingContext,
  effect: NvsFx,
  transform: MaskRegionTransform,
  localTimeUs?: number,
): Promise<void> {
  if (!Object.values(transform).every((value) => value === undefined || Number.isFinite(value))) {
    throw new Error('Mask transform values must be finite.');
  }
  const regions = getMaskRegions(effect, localTimeUs);
  if (regions.length === 0) throw new Error('The effect does not contain a mask region.');
  Object.assign(regions[0], transform);
  await setMaskRegions(context, effect, regions, localTimeUs);
}

export type MaskedEffectStrength =
  | { kind: 'gaussian-blur'; radius: number }
  | { kind: 'mosaic'; unitSize: number };

export async function setMaskedEffectPresentation(
  context: NvsStreamingContext,
  effect: NvsFx,
  strength: MaskedEffectStrength,
  options: {
    featherWidth: number;
    inverse?: boolean;
    ignoreBackground?: boolean;
    localTimeUs?: number;
  },
): Promise<void> {
  if (strength.kind === 'gaussian-blur' && (strength.radius < 0 || strength.radius > 64)) {
    throw new Error('Gaussian Blur Radius must be in [0, 64].');
  }
  if (strength.kind === 'mosaic' && (strength.unitSize < 0 || strength.unitSize > 1)) {
    throw new Error('Mosaic Unit Size must be in [0, 1].');
  }
  if (!Number.isFinite(options.featherWidth) || options.featherWidth < 0) {
    throw new Error('Regional feather width must be a non-negative finite number.');
  }
  if (options.localTimeUs !== undefined && options.localTimeUs < 0) {
    throw new Error('Mask keyframe time cannot be negative.');
  }
  await context.streamingEngineReadyForTimelineModification();
  effect.setRegional(true);
  effect.setIgnoreBackground(options.ignoreBackground ?? true);
  effect.setInverseRegion(options.inverse ?? false);
  const parameter = strength.kind === 'gaussian-blur' ? 'Radius' : 'Unit Size';
  const value = strength.kind === 'gaussian-blur' ? strength.radius : strength.unitSize;
  if (options.localTimeUs === undefined) {
    effect.setFloatVal(parameter, value);
    effect.setRegionalFeatherWidth(options.featherWidth);
  } else {
    effect.setFloatValAtTime(parameter, value, options.localTimeUs);
    effect.setFloatValAtTime('Region Feather Width', options.featherWidth, options.localTimeUs);
  }
}
