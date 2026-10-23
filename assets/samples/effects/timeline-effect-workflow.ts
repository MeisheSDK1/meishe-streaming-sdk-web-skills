import { requireReadyAssetPackage } from '../packages/asset-package';
import { mutateAndPreservePreview } from '../timeline/preserve-preview-position';
import { selectHighestReusableLane } from '../timeline/editor-track-policy';

export type TimelineEffectKind = 'filter' | 'effect';
export type TimelineEffectSource =
  | { kind: 'builtin'; name: string }
  | { kind: 'package'; packageId: string };

export interface EditorTimelineEffect {
  id: string;
  kind: TimelineEffectKind;
  laneIndex: number;
  source: TimelineEffectSource;
  displayName: string;
  inPointUs: number;
  outPointUs: number;
  supportsIntensity: boolean;
  intensity?: number;
  sdk: NvsTimelineVideoFx;
}

export interface TimelineEffectLane {
  index: number;
  items: EditorTimelineEffect[];
}

export type TimelineEffectLaneGroups = Record<TimelineEffectKind, TimelineEffectLane[]>;

export interface AddEditorTimelineEffectRequest {
  id: string;
  kind: TimelineEffectKind;
  source: TimelineEffectSource;
  displayName: string;
  inPointUs: number;
  durationUs: number;
  supportsIntensity?: boolean;
  intensity?: number;
}

const overlaps = (startUs: number, endUs: number, item: EditorTimelineEffect) =>
  startUs < item.outPointUs && endUs > item.inPointUs;

function indexOfEffect(items: EditorTimelineEffect[], id: string): number {
  for (let index = 0; index < items.length; index += 1) {
    if (items[index].id === id) return index;
  }
  return -1;
}

export function highestReusableEffectLane(
  groups: TimelineEffectLaneGroups,
  kind: TimelineEffectKind,
  inPointUs: number,
  outPointUs: number,
): TimelineEffectLane {
  const lanes = groups[kind];
  const highest = selectHighestReusableLane(
    lanes,
    (lane) => lane.items.some((item) => overlaps(inPointUs, outPointUs, item)),
  );
  if (highest) return highest;
  const appended = { index: lanes.length, items: [] };
  lanes.push(appended);
  return appended;
}

function createSdkTimelineEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  source: TimelineEffectSource,
  inPointUs: number,
  durationUs: number,
): NvsTimelineVideoFx {
  if (source.kind === 'package') {
    requireReadyAssetPackage(
      context,
      { id: source.packageId, type: NvsAssetPackageTypeEnum.VideoFx },
      'video effect package',
    );
  }
  const effect = source.kind === 'builtin'
    ? timeline.addBuiltinTimelineVideoFx(inPointUs, durationUs, source.name)
    : timeline.addPackagedTimelineVideoFx(inPointUs, durationUs, source.packageId);
  if (!effect) throw new Error('The SDK could not add the Timeline filter/effect.');
  return effect;
}

export async function addEditorTimelineEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  groups: TimelineEffectLaneGroups,
  request: AddEditorTimelineEffectRequest,
): Promise<EditorTimelineEffect> {
  if (!request.id || !request.displayName || request.inPointUs < 0 || request.durationUs <= 0) {
    throw new Error('Provide a stable ID, display name, non-negative in-point, and positive duration.');
  }
  if (request.intensity !== undefined && request.supportsIntensity !== true) {
    throw new Error('Set intensity only after the selected effect explicitly exposes intensity support.');
  }
  const outPointUs = request.inPointUs + request.durationUs;
  if (request.inPointUs >= timeline.getDuration() || outPointUs > timeline.getDuration()) {
    throw new Error('The Timeline filter/effect range must stay inside the Timeline duration.');
  }
  const lanes = groups[request.kind];
  const laneCountBefore = lanes.length;
  const lane = highestReusableEffectLane(groups, request.kind, request.inPointUs, outPointUs);
  try {
    return await mutateAndPreservePreview(context, timeline, () => {
      const sdk = createSdkTimelineEffect(
        context,
        timeline,
        request.source,
        request.inPointUs,
        request.durationUs,
      );
      try {
        if (request.intensity !== undefined) sdk.setFilterIntensity(request.intensity);
        const item: EditorTimelineEffect = {
          id: request.id,
          kind: request.kind,
          laneIndex: lane.index,
          source: request.source,
          displayName: request.displayName,
          inPointUs: sdk.getInPoint(),
          outPointUs: sdk.getOutPoint(),
          supportsIntensity: request.supportsIntensity === true,
          intensity: request.supportsIntensity === true ? sdk.getFilterIntensity() : undefined,
          sdk,
        };
        lane.items.push(item);
        return item;
      } catch (error) {
        timeline.removeTimelineVideoFx(sdk);
        throw error;
      }
    });
  } catch (error) {
    if (lanes.length > laneCountBefore && lane.items.length === 0) lanes.length = laneCountBefore;
    throw error;
  }
}

export async function trimEditorTimelineEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lane: TimelineEffectLane,
  item: EditorTimelineEffect,
  edge: 'in' | 'out',
  requestedPositionUs: number,
  frameDurationUs: number,
): Promise<EditorTimelineEffect> {
  if (frameDurationUs <= 0 || !Number.isFinite(requestedPositionUs)) {
    throw new Error('Provide a positive frame duration and finite Trim position.');
  }
  const ordered = [...lane.items].sort((left, right) => left.inPointUs - right.inPointUs);
  const index = indexOfEffect(ordered, item.id);
  if (index < 0) throw new Error('The Timeline filter/effect does not belong to this lane.');
  const previousOutUs = ordered[index - 1]?.outPointUs ?? 0;
  const nextInUs = ordered[index + 1]?.inPointUs ?? timeline.getDuration();
  const targetUs = edge === 'in'
    ? Math.min(Math.max(Math.round(requestedPositionUs), previousOutUs), item.outPointUs - frameDurationUs)
    : Math.max(Math.min(Math.round(requestedPositionUs), nextInUs), item.inPointUs + frameDurationUs);

  const previousRange = { inPointUs: item.inPointUs, outPointUs: item.outPointUs };
  await mutateAndPreservePreview(context, timeline, () => {
    try {
      if (edge === 'in') item.sdk.changeInPoint(targetUs);
      else item.sdk.changeOutPoint(targetUs);
      const actualInUs = item.sdk.getInPoint();
      const actualOutUs = item.sdk.getOutPoint();
      if (
        actualOutUs - actualInUs < frameDurationUs ||
        actualInUs < previousOutUs ||
        actualOutUs > nextInUs
      ) {
        throw new Error('The SDK produced an invalid or overlapping Timeline effect range.');
      }
    } catch (error) {
      if (edge === 'in') item.sdk.changeInPoint(previousRange.inPointUs);
      else item.sdk.changeOutPoint(previousRange.outPointUs);
      throw error;
    }
  });
  item.inPointUs = item.sdk.getInPoint();
  item.outPointUs = item.sdk.getOutPoint();
  return item;
}

export async function setEditorTimelineEffectIntensity(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  item: EditorTimelineEffect,
  intensity: number,
): Promise<number> {
  if (!item.supportsIntensity) throw new Error('The selected effect does not expose verified intensity support.');
  if (!Number.isFinite(intensity) || intensity < 0) throw new Error('Effect intensity must be non-negative.');
  await mutateAndPreservePreview(context, timeline, () => item.sdk.setFilterIntensity(intensity));
  item.intensity = item.sdk.getFilterIntensity();
  return item.intensity;
}

export async function deleteEditorTimelineEffect(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lane: TimelineEffectLane,
  item: EditorTimelineEffect,
): Promise<void> {
  const index = indexOfEffect(lane.items, item.id);
  if (index < 0) throw new Error('The Timeline filter/effect does not belong to this lane.');
  await mutateAndPreservePreview(context, timeline, () => {
    // removeTimelineVideoFx returns the next effect, not a success flag.
    timeline.removeTimelineVideoFx(item.sdk);
    lane.items = lane.items.filter(({ id }) => id !== item.id);
  });
}
