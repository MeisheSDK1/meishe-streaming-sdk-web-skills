export interface MutableTimedSdkObject {
  getInPoint(): number;
  getOutPoint(): number;
  changeInPoint(newInPointUs: number): number;
  changeOutPoint(newOutPointUs: number): number;
  movePosition(offsetUs: number): void;
  getZValue?(): number;
  setZValue?(zValue: number): void;
}

function applyTimedObjectRange(owner: MutableTimedSdkObject, inPointUs: number, outPointUs: number): void {
  if (inPointUs > owner.getOutPoint()) {
    owner.changeOutPoint(outPointUs);
    owner.changeInPoint(inPointUs);
  } else {
    owner.changeInPoint(inPointUs);
    owner.changeOutPoint(outPointUs);
  }
}

function throwWithRollback(error: unknown, rollback: () => void): never {
  try {
    rollback();
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], 'Timed-object mutation and rollback both failed.');
  }
  throw error;
}

export interface LogicalTimedItem<TObject extends MutableTimedSdkObject = MutableTimedSdkObject> {
  id: string;
  laneIndex: number;
  creationOrder: number;
  inPointUs: number;
  outPointUs: number;
  sdk: TObject;
}

export function clampTimedObjectTrim(
  edge: 'in' | 'out',
  requestedPositionUs: number,
  item: Pick<LogicalTimedItem, 'inPointUs' | 'outPointUs'>,
  previousOutUs: number,
  nextInUs: number,
  frameDurationUs: number,
): number {
  if (!Number.isFinite(requestedPositionUs) || frameDurationUs <= 0) {
    throw new Error('Trim requires a finite position and positive frame duration.');
  }
  return edge === 'in'
    ? Math.min(Math.max(Math.round(requestedPositionUs), previousOutUs), item.outPointUs - frameDurationUs)
    : Math.max(Math.min(Math.round(requestedPositionUs), nextInUs), item.inPointUs + frameDurationUs);
}

export async function trimLogicalTimedItem<TObject extends MutableTimedSdkObject>(
  context: NvsStreamingContext,
  laneItems: LogicalTimedItem<TObject>[],
  item: LogicalTimedItem<TObject>,
  edge: 'in' | 'out',
  requestedPositionUs: number,
  ownerDurationUs: number,
  frameDurationUs: number,
): Promise<LogicalTimedItem<TObject>> {
  const ordered = laneItems.slice().sort((left, right) => left.inPointUs - right.inPointUs);
  const index = ordered.findIndex(({ id }) => id === item.id);
  if (index < 0) throw new Error('The timed item does not belong to this logical lane.');
  const targetUs = clampTimedObjectTrim(
    edge,
    requestedPositionUs,
    item,
    ordered[index - 1]?.outPointUs ?? 0,
    ordered[index + 1]?.inPointUs ?? ownerDurationUs,
    frameDurationUs,
  );
  await context.streamingEngineReadyForTimelineModification();
  const previous = { inPointUs: item.sdk.getInPoint(), outPointUs: item.sdk.getOutPoint() };
  try {
    if (edge === 'in') item.sdk.changeInPoint(targetUs);
    else item.sdk.changeOutPoint(targetUs);
    item.inPointUs = item.sdk.getInPoint();
    item.outPointUs = item.sdk.getOutPoint();
    if (item.inPointUs < (ordered[index - 1]?.outPointUs ?? 0) || item.outPointUs > (ordered[index + 1]?.inPointUs ?? ownerDurationUs)) {
      throw new Error('The SDK produced an overlapping timed-item range.');
    }
  } catch (error) {
    throwWithRollback(error, () => {
      applyTimedObjectRange(item.sdk, previous.inPointUs, previous.outPointUs);
      item.inPointUs = item.sdk.getInPoint();
      item.outPointUs = item.sdk.getOutPoint();
    });
  }
  return item;
}

export async function setTimedObjectRange(
  context: NvsStreamingContext,
  owner: MutableTimedSdkObject,
  inPointUs: number,
  outPointUs: number,
  zValue?: number,
): Promise<{ inPointUs: number; outPointUs: number }> {
  if (inPointUs < 0 || outPointUs <= inPointUs) {
    throw new Error('Timed SDK objects need a non-negative in-point and a later out-point.');
  }
  if (zValue !== undefined && (!owner.getZValue || !owner.setZValue)) {
    throw new Error('This timed object does not support reversible Z-value ordering.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const previous = {
    inPointUs: owner.getInPoint(),
    outPointUs: owner.getOutPoint(),
    zValue: zValue === undefined ? undefined : owner.getZValue!(),
  };
  try {
    applyTimedObjectRange(owner, inPointUs, outPointUs);
    if (zValue !== undefined) owner.setZValue!(zValue);
    const actual = { inPointUs: owner.getInPoint(), outPointUs: owner.getOutPoint() };
    if (actual.outPointUs <= actual.inPointUs) throw new Error('The SDK produced an invalid timed-object range.');
    return actual;
  } catch (error) {
    throwWithRollback(error, () => {
      applyTimedObjectRange(owner, previous.inPointUs, previous.outPointUs);
      if (previous.zValue !== undefined) owner.setZValue!(previous.zValue);
    });
  }
}

export async function shiftTimedObject(
  context: NvsStreamingContext,
  owner: MutableTimedSdkObject,
  offsetUs: number,
  maximumOutPointUs?: number,
): Promise<{ inPointUs: number; outPointUs: number }> {
  if (!Number.isFinite(offsetUs) || owner.getInPoint() + offsetUs < 0) {
    throw new Error('The timed-object offset would move its in-point before zero.');
  }
  if (maximumOutPointUs !== undefined && owner.getOutPoint() + offsetUs > maximumOutPointUs) {
    throw new Error('The timed-object offset would move its out-point past its owner.');
  }
  await context.streamingEngineReadyForTimelineModification();
  owner.movePosition(offsetUs);
  return { inPointUs: owner.getInPoint(), outPointUs: owner.getOutPoint() };
}

export async function splitLogicalTimedItem<TObject extends MutableTimedSdkObject>(
  context: NvsStreamingContext,
  laneItems: LogicalTimedItem<TObject>[],
  item: LogicalTimedItem<TObject>,
  splitPointUs: number,
  frameDurationUs: number,
  createRight: (inPointUs: number, durationUs: number) => LogicalTimedItem<TObject> | Promise<LogicalTimedItem<TObject>>,
  removeRight: (right: LogicalTimedItem<TObject>) => void | Promise<void>,
): Promise<LogicalTimedItem<TObject>> {
  if (!laneItems.some(({ id }) => id === item.id)) throw new Error('The timed item does not belong to this logical lane.');
  if (
    frameDurationUs <= 0 ||
    splitPointUs < item.inPointUs + frameDurationUs ||
    splitPointUs > item.outPointUs - frameDurationUs
  ) {
    throw new Error('Split must leave at least one frame on both sides of the timed item.');
  }
  await context.lastSeekingFinished();
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  const previousOutUs = item.outPointUs;
  let right: LogicalTimedItem<TObject> | undefined;
  try {
    right = await createRight(splitPointUs, previousOutUs - splitPointUs);
    item.sdk.changeOutPoint(splitPointUs);
    item.outPointUs = item.sdk.getOutPoint();
    right.inPointUs = right.sdk.getInPoint();
    right.outPointUs = right.sdk.getOutPoint();
    if (
      item.outPointUs !== splitPointUs ||
      right.inPointUs !== splitPointUs ||
      right.outPointUs !== previousOutUs
    ) {
      throw new Error('The SDK did not preserve the requested transactional Split ranges.');
    }
    laneItems.push(right);
    return right;
  } catch (error) {
    item.sdk.changeOutPoint(previousOutUs);
    item.outPointUs = item.sdk.getOutPoint();
    if (right) await removeRight(right);
    throw error;
  }
}
