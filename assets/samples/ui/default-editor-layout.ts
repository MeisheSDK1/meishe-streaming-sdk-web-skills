export const DEFAULT_EDITOR_LAYOUT = {
  navigationWidthPx: 80,
  featureWidthPx: 310,
  inspectorWidthPx: 300,
  timelineHeightPx: 340,
  minimumFeatureWidthPx: 240,
  minimumInspectorWidthPx: 260,
  minimumPreviewWidthPx: 480,
  minimumPreviewHeightPx: 270,
  minimumTimelineHeightPx: 180,
  timelineLabelWidthPx: 78,
  timelineRulerHeightPx: 30,
  timelineTrackHeightPx: 46,
  timelineTrackGapPx: 7,
  timelineThumbnailWidthPx: 72,
  minimumTimelineCanvasWidthPx: 900,
  zoomMin: 1,
  zoomMax: 8,
  zoomStep: 0.25,
} as const;

const MAJOR_RULER_STEPS_US = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
  .map((seconds) => seconds * 1_000_000);

export interface TimelineScale {
  scaleUs: number;
  canvasWidthPercent: number;
}

export interface TimelineRulerTick {
  timeUs: number;
  major: boolean;
}

export interface TimelineThumbnail {
  timestampUs: number;
  dataUrl: string;
}

export function clampTimelineZoom(zoom: number): number {
  const { zoomMin, zoomMax } = DEFAULT_EDITOR_LAYOUT;
  return Math.min(zoomMax, Math.max(zoomMin, zoom));
}

export function getTimelineScale(durationUs: number, referenceDurationUs: number, zoom: number): TimelineScale {
  const safeDurationUs = Math.max(0, durationUs);
  const referenceUs = Math.max(1, referenceDurationUs || safeDurationUs);
  const safeZoom = clampTimelineZoom(zoom);
  const scaleUs = Math.max(safeDurationUs, referenceUs / safeZoom, 1);
  return { scaleUs, canvasWidthPercent: scaleUs / referenceUs * safeZoom * 100 };
}

export function getTimelineRulerTicks(scaleUs: number, referenceDurationUs: number, zoom: number): TimelineRulerTick[] {
  const targetStepUs = Math.max(1, referenceDurationUs) / (7 * clampTimelineZoom(zoom));
  const majorStepUs = MAJOR_RULER_STEPS_US.find((step) => step >= targetStepUs)
    ?? MAJOR_RULER_STEPS_US[MAJOR_RULER_STEPS_US.length - 1];
  const minorStepUs = majorStepUs / 5;
  const tickCount = Math.floor(Math.max(1, scaleUs) / minorStepUs);
  return Array.from({ length: tickCount + 1 }, (_, index) => ({
    timeUs: index * minorStepUs,
    major: index % 5 === 0,
  }));
}

export function timelinePointerToTimeUs(clientX: number, laneLeftPx: number, laneWidthPx: number, scaleUs: number, durationUs: number): number {
  const ratio = Math.min(1, Math.max(0, (clientX - laneLeftPx) / Math.max(1, laneWidthPx)));
  return Math.min(Math.max(0, durationUs), Math.round(ratio * Math.max(1, scaleUs)));
}

export function timelineTimeToPercent(timeUs: number, scaleUs: number): number {
  return Math.min(100, Math.max(0, timeUs / Math.max(1, scaleUs) * 100));
}

export function planTimelineThumbnailTiles(
  available: TimelineThumbnail[],
  trimInUs: number,
  trimOutUs: number,
  renderedWidthPx: number,
): TimelineThumbnail[] {
  if (!available.length) return [];
  const tileCount = Math.max(1, Math.ceil(renderedWidthPx / DEFAULT_EDITOR_LAYOUT.timelineThumbnailWidthPx));
  const sourceDurationUs = Math.max(1, trimOutUs - trimInUs);
  return Array.from({ length: tileCount }, (_, index) => {
    const targetUs = trimInUs + sourceDurationUs * ((index + 0.5) / tileCount);
    return available.reduce((nearest, candidate) =>
      Math.abs(candidate.timestampUs - targetUs) < Math.abs(nearest.timestampUs - targetUs) ? candidate : nearest);
  });
}

export function formatTimelineTimecode(valueUs: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.floor(valueUs / 1_000_000 * safeFps));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, '0')).join(':');
}
