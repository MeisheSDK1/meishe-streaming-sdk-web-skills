import { type AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';
import { mutateAndPreservePreview } from '../timeline/preserve-preview-position';

export type ClipAnimationScope = 'source' | 'timeline';

export interface ClipPrimaryAnimation {
  /** Application-owned state: SDK slot 1 cannot distinguish an in-animation from a loop animation. */
  kind: 'in' | 'loop';
  packageRef: AssetPackageRef;
  /** Clip-local time in microseconds. */
  inPointUs: number;
  outPointUs: number;
  /** `source` renders on the raw source; `timeline` renders on the composed frame. */
  scope: ClipAnimationScope;
}

export interface ClipOutAnimation {
  packageRef: AssetPackageRef;
  /** Clip-local time in microseconds. */
  inPointUs: number;
  outPointUs: number;
  scope: ClipAnimationScope;
}

export interface ClipPackageAnimations {
  primary?: ClipPrimaryAnimation;
  out?: ClipOutAnimation;
}

function validateRange(
  animation: Pick<ClipPrimaryAnimation, 'inPointUs' | 'outPointUs'>,
  clipDurationUs: number,
): void {
  if (
    animation.inPointUs < 0 ||
    animation.outPointUs <= animation.inPointUs ||
    animation.outPointUs > clipDurationUs
  ) {
    throw new Error('Video package-animation ranges must be positive and clip-local.');
  }
}

function slotKeys(second: boolean): {
  sourceId: string;
  timelineId: string;
  inPoint: string;
  outPoint: string;
} {
  return second
    ? { sourceId: 'Package2 Id', timelineId: 'Post Package2 Id', inPoint: 'Package2 Effect In', outPoint: 'Package2 Effect Out' }
    : { sourceId: 'Package Id', timelineId: 'Post Package Id', inPoint: 'Package Effect In', outPoint: 'Package Effect Out' };
}

function clearSlot(property: NvsVideoFx, second: boolean): void {
  const keys = slotKeys(second);
  property.setStringVal(keys.sourceId, '');
  property.setStringVal(keys.timelineId, '');
  property.setFloatVal(keys.inPoint, 0);
  property.setFloatVal(keys.outPoint, 0);
}

function verifyClearedSlot(property: NvsVideoFx, second: boolean): void {
  const keys = slotKeys(second);
  if (
    property.getStringVal(keys.sourceId) ||
    property.getStringVal(keys.timelineId) ||
    property.getFloatVal(keys.inPoint) !== 0 ||
    property.getFloatVal(keys.outPoint) !== 0
  ) {
    throw new Error('The SDK did not clear the requested video package-animation slot.');
  }
}

interface ClipAnimationSlotSnapshot {
  sourceId: string;
  timelineId: string;
  inPointUs: number;
  outPointUs: number;
}

function snapshotSlot(property: NvsVideoFx, second: boolean): ClipAnimationSlotSnapshot {
  const keys = slotKeys(second);
  return {
    sourceId: property.getStringVal(keys.sourceId),
    timelineId: property.getStringVal(keys.timelineId),
    inPointUs: property.getFloatVal(keys.inPoint),
    outPointUs: property.getFloatVal(keys.outPoint),
  };
}

function restoreSlot(property: NvsVideoFx, second: boolean, snapshot: ClipAnimationSlotSnapshot): void {
  const keys = slotKeys(second);
  property.setStringVal(keys.sourceId, snapshot.sourceId);
  property.setStringVal(keys.timelineId, snapshot.timelineId);
  property.setFloatVal(keys.inPoint, snapshot.inPointUs);
  property.setFloatVal(keys.outPoint, snapshot.outPointUs);
  const restored = snapshotSlot(property, second);
  if (
    restored.sourceId !== snapshot.sourceId ||
    restored.timelineId !== snapshot.timelineId ||
    restored.inPointUs !== snapshot.inPointUs ||
    restored.outPointUs !== snapshot.outPointUs
  ) {
    throw new Error('The SDK did not restore the previous video package-animation slot.');
  }
}

function mutateSlotsAtomically(property: NvsVideoFx, mutate: () => void): void {
  const previousPrimary = snapshotSlot(property, false);
  const previousOut = snapshotSlot(property, true);
  try {
    mutate();
  } catch (error) {
    try {
      restoreSlot(property, false, previousPrimary);
      restoreSlot(property, true, previousOut);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Video package-animation mutation and rollback both failed.');
    }
    throw error;
  }
}

function setSlot(
  property: NvsVideoFx,
  animation: ClipPrimaryAnimation | ClipOutAnimation,
  second: boolean,
): void {
  clearSlot(property, second);
  const keys = slotKeys(second);
  const packageKey = animation.scope === 'source' ? keys.sourceId : keys.timelineId;
  property.setStringVal(packageKey, animation.packageRef.id);
  property.setFloatVal(keys.inPoint, animation.inPointUs);
  property.setFloatVal(keys.outPoint, animation.outPointUs);
}

function verifySlot(
  property: NvsVideoFx,
  animation: ClipPrimaryAnimation | ClipOutAnimation,
  second: boolean,
): void {
  const keys = slotKeys(second);
  const packageKey = animation.scope === 'source' ? keys.sourceId : keys.timelineId;
  const unusedPackageKey = animation.scope === 'source' ? keys.timelineId : keys.sourceId;
  if (
    property.getStringVal(packageKey) !== animation.packageRef.id ||
    property.getStringVal(unusedPackageKey) ||
    property.getFloatVal(keys.inPoint) !== animation.inPointUs ||
    property.getFloatVal(keys.outPoint) !== animation.outPointUs
  ) {
    throw new Error('The SDK did not retain the requested video package-animation parameters.');
  }
}

export function requireReadyClipPackageAnimations(
  context: NvsStreamingContext,
  animations: ClipPackageAnimations,
): void {
  for (const animation of [animations.primary, animations.out]) {
    if (animation) requireReadyAssetPackage(context, animation.packageRef, 'video animation package');
  }
}

export function fitClipPackageAnimationsToDuration(
  animations: ClipPackageAnimations,
  clipDurationUs: number,
): ClipPackageAnimations {
  if (!Number.isInteger(clipDurationUs) || clipDurationUs <= 0) {
    throw new Error('clipDurationUs must be a positive integer.');
  }
  if (animations.primary?.kind === 'loop') {
    if (animations.out) throw new Error('A loop animation and an out-animation cannot share the video package slots.');
    return { primary: { ...animations.primary, inPointUs: 0, outPointUs: clipDurationUs } };
  }

  const bothEnabled = Boolean(animations.primary && animations.out);
  if (bothEnabled && clipDurationUs < 2) {
    throw new Error('The clip is too short to hold non-overlapping in- and out-animations.');
  }
  const maximumDurationUs = bothEnabled ? Math.max(1, Math.floor(clipDurationUs / 2)) : clipDurationUs;
  const result: ClipPackageAnimations = {};
  if (animations.primary) {
    const durationUs = Math.min(maximumDurationUs, Math.max(1, animations.primary.outPointUs - animations.primary.inPointUs));
    result.primary = { ...animations.primary, inPointUs: 0, outPointUs: durationUs };
  }
  if (animations.out) {
    const durationUs = Math.min(maximumDurationUs, Math.max(1, animations.out.outPointUs - animations.out.inPointUs));
    result.out = { ...animations.out, inPointUs: clipDurationUs - durationUs, outPointUs: clipDurationUs };
  }
  return result;
}

function getPropertyFx(clip: NvsVideoClip): NvsVideoFx {
  clip.enablePropertyVideoFx(true);
  const property = clip.getPropertyVideoFx();
  if (!property) throw new Error('The SDK did not expose the clip property effect.');
  return property;
}

export async function clearClipPackageAnimations(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  clip: NvsVideoClip,
): Promise<NvsVideoFx> {
  return mutateAndPreservePreview(context, timeline, () => {
    const property = getPropertyFx(clip);
    mutateSlotsAtomically(property, () => {
      clearSlot(property, false);
      clearSlot(property, true);
      verifyClearedSlot(property, false);
      verifyClearedSlot(property, true);
    });
    return property;
  });
}

export async function setClipPackageAnimations(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  clip: NvsVideoClip,
  animations: ClipPackageAnimations,
): Promise<NvsVideoFx> {
  if (!animations.primary && !animations.out) {
    return clearClipPackageAnimations(context, timeline, clip);
  }
  if (animations.primary?.kind === 'loop' && animations.out) {
    throw new Error('A loop animation and an out-animation cannot share the video package slots.');
  }

  const clipDurationUs = clip.getOutPoint() - clip.getInPoint();
  for (const animation of [animations.primary, animations.out]) {
    if (animation) validateRange(animation, clipDurationUs);
  }
  if (
    animations.primary?.kind === 'in' &&
    animations.out &&
    animations.primary.outPointUs > animations.out.inPointUs
  ) {
    throw new Error('Video in- and out-animation ranges must not overlap.');
  }
  requireReadyClipPackageAnimations(context, animations);

  return mutateAndPreservePreview(context, timeline, () => {
    const property = getPropertyFx(clip);
    mutateSlotsAtomically(property, () => {
      // Clear only package-animation parameters; transform and keyframe parameters remain intact.
      clearSlot(property, false);
      clearSlot(property, true);
      if (animations.primary) setSlot(property, animations.primary, false);
      if (animations.out) setSlot(property, animations.out, true);
      if (animations.primary) verifySlot(property, animations.primary, false);
      else verifyClearedSlot(property, false);
      if (animations.out) verifySlot(property, animations.out, true);
      else verifyClearedSlot(property, true);
    });
    return property;
  });
}
