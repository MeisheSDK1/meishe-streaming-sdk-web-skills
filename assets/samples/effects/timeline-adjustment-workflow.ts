import { clampTimedObjectTrim } from '../timeline/timed-object-operations';
import { mutateAndPreservePreview } from '../timeline/preserve-preview-position';
import { selectHighestReusableLane } from '../timeline/editor-track-policy';
import { AdjustmentFxName, AdjustmentValues } from './adjustment-schema';
import {
  addTimelineAdjustmentStack,
  setTimelineAdjustments,
  TimelineAdjustmentHandle,
} from './timeline-adjustment';

export type TimelineAdjustmentValues = Partial<Record<AdjustmentFxName, AdjustmentValues>>;

export interface EditorTimelineAdjustment {
  id: string;
  laneIndex: number;
  creationOrder: number;
  inPointUs: number;
  outPointUs: number;
  values: TimelineAdjustmentValues;
  handle: TimelineAdjustmentHandle;
}

export interface TimelineAdjustmentLane {
  index: number;
  items: EditorTimelineAdjustment[];
}

export interface HistoryGesture {
  begin(): void;
  commit(): void;
  cancel(): void;
}

const overlaps = (startUs: number, endUs: number, item: EditorTimelineAdjustment) =>
  startUs < item.outPointUs && endUs > item.inPointUs;

function stackMembers(item: EditorTimelineAdjustment): NvsTimelineVideoFx[] {
  return Object.values(item.handle.effects);
}

function assertSynchronizedRange(item: EditorTimelineAdjustment): void {
  if (stackMembers(item).some((fx) => fx.getInPoint() !== item.inPointUs || fx.getOutPoint() !== item.outPointUs)) {
    throw new Error('Every SDK effect in one logical adjustment item must share the same range.');
  }
}

function restoreStackRange(item: EditorTimelineAdjustment, inPointUs: number, outPointUs: number): void {
  for (const fx of stackMembers(item)) {
    if (inPointUs > fx.getOutPoint()) {
      fx.changeOutPoint(outPointUs);
      fx.changeInPoint(inPointUs);
    } else {
      fx.changeInPoint(inPointUs);
      fx.changeOutPoint(outPointUs);
    }
  }
  item.inPointUs = inPointUs;
  item.outPointUs = outPointUs;
  assertSynchronizedRange(item);
}

export function highestReusableAdjustmentLane(
  lanes: TimelineAdjustmentLane[],
  inPointUs: number,
  outPointUs: number,
): TimelineAdjustmentLane | null {
  return selectHighestReusableLane(
    lanes,
    (lane) => lane.items.some((item) => overlaps(inPointUs, outPointUs, item)),
  );
}

export async function addEditorTimelineAdjustment(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lanes: TimelineAdjustmentLane[],
  input: {
    id: string;
    creationOrder: number;
    inPointUs: number;
    durationUs: number;
    values?: TimelineAdjustmentValues;
  },
): Promise<EditorTimelineAdjustment> {
  const outPointUs = input.inPointUs + input.durationUs;
  let lane = highestReusableAdjustmentLane(lanes, input.inPointUs, outPointUs);
  const createdLane = !lane;
  if (!lane) {
    lane = { index: lanes.length, items: [] };
    lanes.push(lane);
  }
  let handle: TimelineAdjustmentHandle | undefined;
  try {
    handle = await addTimelineAdjustmentStack(context, timeline, input.inPointUs, input.durationUs, input.values);
    const firstMember = Object.values(handle.effects)[0];
    const item: EditorTimelineAdjustment = {
      id: input.id,
      laneIndex: lane.index,
      creationOrder: input.creationOrder,
      inPointUs: firstMember.getInPoint(),
      outPointUs: firstMember.getOutPoint(),
      values: input.values ?? {},
      handle,
    };
    assertSynchronizedRange(item);
    lane.items.push(item);
    return item;
  } catch (error) {
    await handle?.remove();
    if (createdLane && lane.items.length === 0) lanes.pop();
    throw error;
  }
}

export async function trimEditorTimelineAdjustment(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lane: TimelineAdjustmentLane,
  item: EditorTimelineAdjustment,
  edge: 'in' | 'out',
  requestedPositionUs: number,
  frameDurationUs: number,
): Promise<EditorTimelineAdjustment> {
  const ordered = lane.items.slice().sort((left, right) => left.inPointUs - right.inPointUs);
  const index = ordered.findIndex(({ id }) => id === item.id);
  if (index < 0) throw new Error('The adjustment item does not belong to this lane.');
  const targetUs = clampTimedObjectTrim(
    edge,
    requestedPositionUs,
    item,
    ordered[index - 1]?.outPointUs ?? 0,
    ordered[index + 1]?.inPointUs ?? timeline.getDuration(),
    frameDurationUs,
  );
  const previousRange = { inPointUs: item.inPointUs, outPointUs: item.outPointUs };
  return mutateAndPreservePreview(context, timeline, () => {
    try {
      for (const fx of stackMembers(item)) {
        if (edge === 'in') fx.changeInPoint(targetUs);
        else fx.changeOutPoint(targetUs);
      }
      item.inPointUs = stackMembers(item)[0].getInPoint();
      item.outPointUs = stackMembers(item)[0].getOutPoint();
      assertSynchronizedRange(item);
      return item;
    } catch (error) {
      restoreStackRange(item, previousRange.inPointUs, previousRange.outPointUs);
      throw error;
    }
  });
}

export async function splitEditorTimelineAdjustment(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lane: TimelineAdjustmentLane,
  item: EditorTimelineAdjustment,
  splitPointUs: number,
  rightId: string,
  frameDurationUs: number,
): Promise<EditorTimelineAdjustment> {
  if (splitPointUs < item.inPointUs + frameDurationUs || splitPointUs > item.outPointUs - frameDurationUs) {
    throw new Error('Split must leave at least one frame on both sides of the adjustment item.');
  }
  const oldOutPointUs = item.outPointUs;
  let rightHandle: TimelineAdjustmentHandle | undefined;
  return mutateAndPreservePreview(context, timeline, async () => {
    try {
      rightHandle = await addTimelineAdjustmentStack(context, timeline, splitPointUs, oldOutPointUs - splitPointUs, item.values);
      for (const fx of stackMembers(item)) fx.changeOutPoint(splitPointUs);
      item.outPointUs = splitPointUs;
      assertSynchronizedRange(item);
      const right: EditorTimelineAdjustment = {
        ...item,
        id: rightId,
        inPointUs: splitPointUs,
        outPointUs: oldOutPointUs,
        values: { ...item.values },
        handle: rightHandle,
      };
      assertSynchronizedRange(right);
      lane.items.push(right);
      return right;
    } catch (error) {
      restoreStackRange(item, item.inPointUs, oldOutPointUs);
      await rightHandle?.remove();
      throw error;
    }
  });
}

export async function resetAllEditorTimelineAdjustmentValues(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  item: EditorTimelineAdjustment,
  history: HistoryGesture,
): Promise<void> {
  const previousValues = item.values;
  history.begin();
  try {
    await mutateAndPreservePreview(context, timeline, () => item.handle.reset());
    item.values = {};
    history.commit();
  } catch (error) {
    setTimelineAdjustments(item.handle.effects, previousValues);
    item.values = previousValues;
    history.cancel();
    throw error;
  }
}

export async function removeEditorTimelineAdjustment(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lane: TimelineAdjustmentLane,
  item: EditorTimelineAdjustment,
): Promise<void> {
  if (!lane.items.some(({ id }) => id === item.id)) throw new Error('The adjustment item does not belong to this lane.');
  await mutateAndPreservePreview(context, timeline, () => item.handle.remove());
  lane.items = lane.items.filter(({ id }) => id !== item.id);
}
