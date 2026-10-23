import { getMediaDisplaySize } from '../utils/media-display-size';
import {
  createMaskRegionFromPlane,
  MaskShape,
  setMaskRegions,
} from './mask-region-io';

export interface VideoMaskViewBox {
  /** Unrotated source-local video bounds in LiveWindow view coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  /** Clockwise rotation in LiveWindow view coordinates. */
  rotationDegrees: number;
  horizontalFlip: boolean;
  verticalFlip: boolean;
}

export interface VideoMaskShapeOptions {
  videoBox: VideoMaskViewBox;
  /** Center in LiveWindow view coordinates. Defaults to the source-video center. */
  center?: NvsPointF;
  horizontalScale?: number;
  verticalScale?: number;
  cornerRadiusRate?: number;
}

export interface VideoMaskViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function assertVideoBox(box: VideoMaskViewBox): void {
  if (
    ![box.x, box.y, box.width, box.height, box.centerX, box.centerY, box.rotationDegrees].every(Number.isFinite) ||
    box.width <= 0 || box.height <= 0
  ) {
    throw new Error('Video mask view box values must be finite and its size must be positive.');
  }
}

export function mapVideoViewToMaskNdc(point: NvsPointF, box: VideoMaskViewBox): NvsPointF {
  assertVideoBox(box);
  // Video Raw FX uses a source-local NDC plane whose origin is the displayed
  // source video's center, not the timeline center.
  const radians = (-box.rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = point.x - box.centerX;
  const deltaY = point.y - box.centerY;
  const localX = deltaX * cosine - deltaY * sine;
  const localY = deltaX * sine + deltaY * cosine;
  return new NvsPointF(
    (localX / (box.width / 2)) * (box.horizontalFlip ? -1 : 1),
    (-localY / (box.height / 2)) * (box.verticalFlip ? -1 : 1),
  );
}

export function mapVideoMaskNdcToView(point: NvsPointF, box: VideoMaskViewBox): NvsPointF {
  assertVideoBox(box);
  const localX = point.x * (box.width / 2) * (box.horizontalFlip ? -1 : 1);
  const localY = -point.y * (box.height / 2) * (box.verticalFlip ? -1 : 1);
  const radians = (box.rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return new NvsPointF(
    box.centerX + localX * cosine - localY * sine,
    box.centerY + localX * sine + localY * cosine,
  );
}

function getTimelineViewSize(liveWindow: NvsLiveWindow, timeline: NvsTimeline): { width: number; height: number } {
  const resolution = timeline.getVideoRes();
  const halfWidth = Number(resolution.imageWidth) / 2;
  const halfHeight = Number(resolution.imageHeight) / 2;
  if (halfWidth <= 0 || halfHeight <= 0) throw new Error('The timeline video resolution is invalid.');
  const corners = [
    new NvsPointF(-halfWidth, halfHeight),
    new NvsPointF(halfWidth, halfHeight),
    new NvsPointF(halfWidth, -halfHeight),
    new NvsPointF(-halfWidth, -halfHeight),
  ].map((point) => liveWindow.mapCanonicalToView(point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width <= 0 || height <= 0) {
    throw new Error('Connect and lay out the LiveWindow before calculating a video mask box.');
  }
  return { width, height };
}

export function getVideoMaskViewBox(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  liveWindow: NvsLiveWindow,
  clip: NvsVideoClip,
  liveWindowSize?: { width: number; height: number },
): VideoMaskViewBox {
  if (liveWindowSize && (liveWindowSize.width <= 0 || liveWindowSize.height <= 0)) {
    throw new Error('LiveWindow view size must be positive.');
  }
  clip.enablePropertyVideoFx(true);
  const property = clip.getPropertyVideoFx();
  if (!property) throw new Error('The SDK could not enable the clip property effect.');
  const media = getMediaDisplaySize(context, clip.getFilePath());
  // Derive the laid-out timeline image size through LiveWindow mapping. The
  // optional liveWindowSize is only a sanity check for the caller's current layout.
  const timelineView = getTimelineViewSize(liveWindow, timeline);
  if (liveWindowSize && (timelineView.width > liveWindowSize.width + 1 || timelineView.height > liveWindowSize.height + 1)) {
    throw new Error('The supplied LiveWindow size does not match its current timeline layout.');
  }

  const fillMode = property.getMenuVal('Fill Mode');
  const fit = Math.min(timelineView.width / media.width, timelineView.height / media.height);
  const fill = Math.max(timelineView.width / media.width, timelineView.height / media.height);
  const presentationScale = fillMode === 'PanAndScan' ? fill : fillMode === 'Stretch' ? 0 : fit;
  const scaleX = property.getFloatVal('Scale X');
  const scaleY = property.getFloatVal('Scale Y');
  const width = (fillMode === 'Stretch' ? timelineView.width : media.width * presentationScale) *
    Math.abs(scaleX);
  const height = (fillMode === 'Stretch' ? timelineView.height : media.height * presentationScale) *
    Math.abs(scaleY);
  const center = liveWindow.mapCanonicalToView(new NvsPointF(
    property.getFloatVal('Trans X') + property.getFloatVal('Anchor X'),
    property.getFloatVal('Trans Y') + property.getFloatVal('Anchor Y'),
  ));
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    centerX: center.x,
    centerY: center.y,
    // The SDK property uses canonical Y-up rotation; view coordinates use Y-down.
    rotationDegrees: -property.getFloatVal('Rotation'),
    horizontalFlip: scaleX < 0,
    verticalFlip: scaleY < 0,
  };
}

export function createVideoMaskRegion(
  shape: MaskShape,
  options: VideoMaskShapeOptions,
): NvsRegionInfo {
  assertVideoBox(options.videoBox);
  const horizontalScale = options.horizontalScale ?? 1;
  const verticalScale = options.verticalScale ?? 1;
  if (horizontalScale <= 0 || verticalScale <= 0) throw new Error('Mask shape scales must be positive.');
  const base = Math.min(options.videoBox.width, options.videoBox.height) / 2;
  return createMaskRegionFromPlane(shape, {
    center: options.center ?? new NvsPointF(options.videoBox.centerX, options.videoBox.centerY),
    width: shape === 'line' ? options.videoBox.width : base * horizontalScale,
    height: shape === 'line' ? options.videoBox.height : base * verticalScale,
    cornerRadiusRate: options.cornerRadiusRate,
    yAxis: 'down',
    mapPointToNdc: (point) => mapVideoViewToMaskNdc(point, options.videoBox),
  });
}

/**
 * Builds a rectangular video-local mask from a box drawn in LiveWindow view coordinates.
 * Use this instead of converting a preview rectangle to NDC in application code.
 */
export function createVideoRectMaskRegionFromViewRect(
  shape: 'rectangle' | 'rounded-rectangle',
  videoBox: VideoMaskViewBox,
  viewRect: VideoMaskViewRect,
  cornerRadiusRate = shape === 'rectangle' ? 0 : 0.2,
): NvsRegionInfo {
  assertVideoBox(videoBox);
  if (
    ![viewRect.x, viewRect.y, viewRect.width, viewRect.height, cornerRadiusRate].every(Number.isFinite) ||
    viewRect.width <= 0 || viewRect.height <= 0 || cornerRadiusRate < 0 || cornerRadiusRate > 1
  ) {
    throw new Error('The video mask view rectangle and corner radius are invalid.');
  }
  const center = new NvsPointF(
    viewRect.x + viewRect.width / 2,
    viewRect.y + viewRect.height / 2,
  );
  const corners = [
    new NvsPointF(viewRect.x, viewRect.y),
    new NvsPointF(viewRect.x + viewRect.width, viewRect.y),
    new NvsPointF(viewRect.x + viewRect.width, viewRect.y + viewRect.height),
    new NvsPointF(viewRect.x, viewRect.y + viewRect.height),
  ].map((point) => mapVideoViewToMaskNdc(point, videoBox));
  const tolerance = 0.0001;
  if (corners.some((point) => Math.abs(point.x) > 1 + tolerance || Math.abs(point.y) > 1 + tolerance)) {
    throw new Error('The video mask view rectangle exceeds the displayed source-video bounds.');
  }
  return createMaskRegionFromPlane(shape, {
    center,
    width: viewRect.width,
    height: viewRect.height,
    cornerRadiusRate,
    yAxis: 'down',
    mapPointToNdc: (point) => mapVideoViewToMaskNdc(point, videoBox),
  });
}

export async function addVideoMaskEffect(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  region: NvsRegionInfo,
  options: { inverse?: boolean; featherWidth?: number; ignoreBackground?: boolean } = {},
): Promise<NvsVideoFx> {
  const featherWidth = options.featherWidth ?? 0;
  if (!Number.isFinite(featherWidth) || featherWidth < 0) {
    throw new Error('Regional feather width must be a non-negative finite number.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const effect = clip.appendRawBuiltinFx('Mosaic');
  if (!effect) throw new Error('The SDK could not add the built-in Mosaic video effect.');
  try {
    effect.setAbsoluteTimeUsed(true);
    effect.setRegional(true);
    effect.setIgnoreBackground(options.ignoreBackground ?? true);
    effect.setInverseRegion(options.inverse ?? false);
    effect.setFloatVal('Unit Size', 0);
    effect.setRegionalFeatherWidth(featherWidth);
    await setMaskRegions(context, effect, [region]);
    return effect;
  } catch (error) {
    clip.removeRawFx(effect.getIndex());
    throw error;
  }
}

export async function setVideoEffectMaskRegion(
  context: NvsStreamingContext,
  effect: NvsVideoFx,
  region: NvsRegionInfo,
  localTimeUs?: number,
): Promise<void> {
  if (!(effect instanceof NvsVideoFx)) throw new Error('Expected a video-clip NvsVideoFx owner.');
  await setMaskRegions(context, effect, [region], localTimeUs);
}
