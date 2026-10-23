#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  intervalsOverlap,
  orderEditorTimelineRows,
  selectHighestReusableLane,
  selectHighestUserTrack,
} from '../assets/samples/timeline/editor-track-policy.ts';
import { mutateAndPreservePreview } from '../assets/samples/timeline/preserve-preview-position.ts';
import {
  clampTimedObjectTrim,
  setTimedObjectRange,
  splitLogicalTimedItem,
  trimLogicalTimedItem,
} from '../assets/samples/timeline/timed-object-operations.ts';
import { SingleFlightQueue } from '../assets/samples/utils/single-flight-queue.ts';
import {
  DEFAULT_EDITOR_LAYOUT,
  getTimelineRulerTicks,
  getTimelineScale,
  planTimelineThumbnailTiles,
  timelinePointerToTimeUs,
} from '../assets/samples/ui/default-editor-layout.ts';

register('./validation/ts-extension-loader.mjs', import.meta.url);

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) throw new Error(message);
};
const placeInHighestKindLane = (groups, kind, start, end) => {
  let lane = selectHighestReusableLane(
    groups[kind],
    (candidate) => candidate.clips.some((clip) => intervalsOverlap(start, end, { inPoint: clip.start, outPoint: clip.end })),
  );
  if (!lane) {
    lane = { id: `${kind}-${groups[kind].length}`, clips: [] };
    groups[kind].push(lane);
  }
  lane.clips.push({ start, end });
  return lane;
};
const highestTracksFirst = (tracks) => tracks.slice().reverse();
const commandCapabilities = {
  media: { trim: true, split: true },
  caption: { trim: true, split: true },
  sticker: { trim: true, split: true },
  filter: { trim: true, split: true },
  effect: { trim: true, split: true },
  adjustment: { trim: true, split: true },
  transition: { trim: false, split: false },
};
const isGaplessTransitionBoundary = (source, next) => Boolean(next) && source.end === next.start;

function planTiles(frames, trimIn, trimOut, renderedWidth, tileWidth = 72) {
  const count = Math.max(1, Math.ceil(renderedWidth / tileWidth));
  return Array.from({ length: count }, (_, index) => {
    const source = trimIn + (trimOut - trimIn) * ((index + 0.5) / count);
    return frames.reduce((nearest, frame) => Math.abs(frame - source) < Math.abs(nearest - source) ? frame : nearest);
  });
}

async function main() {
  const [captionFormattingModule, modularHistoryModule, clipKeyframesModule, clipAnimationModule] = await Promise.all([
    import('../assets/samples/captions/caption-formatting.ts'),
    import('../assets/samples/captions/modular-caption-history.ts'),
    import('../assets/samples/effects/clip-transform-keyframes.ts'),
    import('../assets/samples/video/clip-animation.ts'),
  ]);
  const { readCaptionFormatting } = captionFormattingModule;
  const { snapshotModularCaption } = modularHistoryModule;
  const { readGroupedClipTransformKeyframeTimes, removeClipTransformKeyframeGroup } = clipKeyframesModule;
  const { setClipPackageAnimations } = clipAnimationModule;
  const tracks = [{ id: 'v1', clips: [{ inPoint: 0, outPoint: 3 }] }];
  assert(!intervalsOverlap(3, 5, tracks[0].clips[0]), 'Adjacent interval boundaries must not overlap.');
  assert(selectHighestUserTrack(tracks, 3, 5)?.id === 'v1', 'A compatible highest user track must be reused.');
  assert(selectHighestUserTrack(tracks, 2, 4) === null, 'A conflict on the highest same-type track must request a new track.');
  const highestOnlyTracks = [
    { id: 'v1', clips: [{ inPoint: 0, outPoint: 2 }] },
    { id: 'v2', clips: [{ inPoint: 2, outPoint: 5 }] },
  ];
  assert(selectHighestUserTrack(highestOnlyTracks, 3, 4) === null, 'A lower free track must not be searched when the highest same-type track conflicts.');
  assert(selectHighestUserTrack(highestOnlyTracks, 5, 6)?.id === 'v2', 'The highest same-type track must be reused when adjacent space is available.');
  assert(highestTracksFirst([{ id: 'v1' }, { id: 'v2' }]).map(({ id }) => id).join(',') === 'v2,v1', 'The highest SDK track must render as the top Timeline row.');
  const orderedRows = orderEditorTimelineRows([
    { id: 'a1', group: 'audio', creationOrder: 5 },
    { id: 'v1', group: 'video', creationOrder: 2 },
    { id: 'n1', group: 'non-media', creationOrder: 3 },
    { id: 'n2', group: 'non-media', creationOrder: 7 },
    { id: 'v2', group: 'video', creationOrder: 6 },
  ]).map(({ id }) => id).join(',');
  assert(orderedRows === 'n2,n1,v2,v1,a1', 'Non-media rows must precede video and audio, with newest rows first inside each group.');
  assert(isGaplessTransitionBoundary({ end: 3 }, { start: 3 }), 'A shared clip boundary must allow a transition candidate.');
  assert(!isGaplessTransitionBoundary({ end: 3 }, { start: 4 }), 'A Timeline gap must reject a transition candidate.');

  const effectGroups = { filter: [], effect: [], adjustment: [] };
  assert(placeInHighestKindLane(effectGroups, 'filter', 0, 3).id === 'filter-0', 'The first filter must create F1.');
  assert(placeInHighestKindLane(effectGroups, 'effect', 0, 3).id === 'effect-0', 'Effects must use a lane namespace independent from filters.');
  assert(placeInHighestKindLane(effectGroups, 'filter', 3, 5).id === 'filter-0', 'Adjacent filters must reuse the highest filter lane.');
  assert(placeInHighestKindLane(effectGroups, 'filter', 2, 4).id === 'filter-1', 'An overlap on the highest filter lane must append one filter lane.');
  assert(effectGroups.effect.length === 1, 'Filter conflicts must not append an effect lane.');
  assert(placeInHighestKindLane(effectGroups, 'adjustment', 0, 3).id === 'adjustment-0', 'Adjustments must use a lane namespace independent from filters and effects.');

  const timedItem = { start: 3, end: 7 };
  assert(clampTimedObjectTrim('in', 1, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, 9, 1) === 2, 'FX left Trim must stop at the same-lane previous out-point.');
  assert(clampTimedObjectTrim('out', 10, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, 9, 1) === 9, 'FX right Trim must stop at the same-lane next in-point.');
  assert(clampTimedObjectTrim('in', 7, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, 9, 1) === 6, 'FX Trim must retain at least one frame.');
  assert(clampTimedObjectTrim('in', 1, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, Number.POSITIVE_INFINITY, 1) === 2, 'Media left Trim must not overlap the previous same-track clip.');
  assert(clampTimedObjectTrim('out', 10, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, 9, 1) === 9, 'Media right Trim must not overlap the next same-track clip.');
  for (const kind of ['caption', 'sticker', 'filter', 'effect', 'adjustment']) {
    assert(clampTimedObjectTrim('in', 1, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, 9, 1) === 2, `${kind} left Trim must not overlap its same-lane neighbor.`);
    assert(clampTimedObjectTrim('out', 10, { inPointUs: timedItem.start, outPointUs: timedItem.end }, 2, 9, 1) === 9, `${kind} right Trim must not overlap its same-lane neighbor.`);
  }
  for (const [kind, capability] of Object.entries(commandCapabilities)) {
    assert(capability.trim === (kind !== 'transition'), `${kind} Trim capability is incorrect.`);
    assert(capability.split === (kind !== 'transition'), `${kind} Split capability is incorrect.`);
  }
  const splitContext = {
    lastSeekingFinished: async () => undefined,
    stop: () => undefined,
    streamingEngineReadyForTimelineModification: async () => undefined,
  };
  const timedSdk = (start, end) => ({
    start,
    end,
    getInPoint() { return this.start; },
    getOutPoint() { return this.end; },
    changeInPoint(value) { this.start = value; return value; },
    changeOutPoint(value) { this.end = value; return value; },
    movePosition(offset) { this.start += offset; this.end += offset; },
  });
  const leftSplitItem = { id: 'left', laneIndex: 0, creationOrder: 1, inPointUs: 0, outPointUs: 10, sdk: timedSdk(0, 10) };
  const splitLane = [leftSplitItem];
  const rightSplitItem = await splitLogicalTimedItem(
    splitContext,
    splitLane,
    leftSplitItem,
    4,
    1,
    (start, duration) => ({ id: 'right', laneIndex: 0, creationOrder: 1, inPointUs: start, outPointUs: start + duration, sdk: timedSdk(start, start + duration) }),
    () => { throw new Error('Successful Split must not roll back the right item.'); },
  );
  assert(leftSplitItem.outPointUs === 4 && rightSplitItem.inPointUs === 4 && splitLane.length === 2, 'The real timed-item Split adapter must create adjacent transactional ranges.');
  let corruptTrimOnce = true;
  const rollbackTrimSdk = {
    ...timedSdk(3, 7),
    changeInPoint(value) {
      this.start = corruptTrimOnce ? value - 1 : value;
      corruptTrimOnce = false;
      return this.start;
    },
  };
  const rollbackTrimItem = { id: 'trim', laneIndex: 0, creationOrder: 1, inPointUs: 3, outPointUs: 7, sdk: rollbackTrimSdk };
  try {
    await trimLogicalTimedItem(splitContext, [
      { id: 'previous', laneIndex: 0, creationOrder: 0, inPointUs: 0, outPointUs: 2, sdk: timedSdk(0, 2) },
      rollbackTrimItem,
    ], rollbackTrimItem, 'in', 2, 10, 1);
    throw new Error('Corrupt Trim output must fail validation.');
  } catch (error) {
    assert(error.message === 'The SDK produced an overlapping timed-item range.', 'Trim must report the SDK range validation failure.');
  }
  assert(rollbackTrimSdk.getInPoint() === 3 && rollbackTrimItem.inPointUs === 3, 'Failed Trim validation must restore SDK and logical ranges.');
  let corruptRangeOnce = true;
  const rollbackRangeSdk = {
    ...timedSdk(1, 4),
    changeOutPoint(value) {
      this.end = corruptRangeOnce ? this.start : value;
      corruptRangeOnce = false;
      return this.end;
    },
  };
  try {
    await setTimedObjectRange(splitContext, rollbackRangeSdk, 2, 6);
    throw new Error('Corrupt range output must fail validation.');
  } catch (error) {
    assert(error.message === 'The SDK produced an invalid timed-object range.', 'Range mutation must report the SDK range validation failure.');
  }
  assert(rollbackRangeSdk.getInPoint() === 1 && rollbackRangeSdk.getOutPoint() === 4, 'Failed timed-range validation must restore the previous SDK range.');
  const adjustmentMembers = Array.from({ length: 6 }, () => ({ start: 3, end: 7, value: 1 }));
  adjustmentMembers.forEach((member) => { member.end = 5; });
  assert(adjustmentMembers.every(({ start, end }) => start === 3 && end === 5), 'Adjustment Trim/Split must keep all stack-member ranges synchronized.');
  let adjustmentHistoryCommits = 0;
  adjustmentMembers.forEach((member) => { member.value = 0; });
  adjustmentHistoryCommits += 1;
  assert(adjustmentMembers.every(({ value }) => value === 0) && adjustmentHistoryCommits === 1, 'Reset all must reset the complete adjustment stack in one history entry.');
  const previewEvents = [];
  const previewContext = {
    getTimelineCurrentPosition: () => 8,
    lastSeekingFinished: async () => { previewEvents.push('last-seek'); },
    stop: () => { previewEvents.push('stop'); },
    streamingEngineReadyForTimelineModification: async () => { previewEvents.push('ready'); },
    seekTimeline: (_timeline, target) => { previewEvents.push(`seek:${target}`); return true; },
  };
  globalThis.NvsVideoPreviewSizeModeEnum = { LiveWindowSize: 0 };
  try {
    await mutateAndPreservePreview(previewContext, { getDuration: () => 6 }, () => { previewEvents.push('mutate'); });
  } finally {
    delete globalThis.NvsVideoPreviewSizeModeEnum;
  }
  assert(previewEvents.join(',') === 'last-seek,stop,ready,mutate,seek:5', 'The real preview-preservation helper must wait, mutate, clamp, and seek in order.');
  const failedPreviewEvents = [];
  globalThis.NvsVideoPreviewSizeModeEnum = { LiveWindowSize: 0 };
  try {
    await mutateAndPreservePreview({
      ...previewContext,
      lastSeekingFinished: async () => undefined,
      stop: () => undefined,
      streamingEngineReadyForTimelineModification: async () => undefined,
      seekTimeline: () => { failedPreviewEvents.push('seek-after-error'); return true; },
    }, { getDuration: () => 6 }, () => { throw new Error('expected mutation failure'); });
  } catch (error) {
    assert(error.message === 'expected mutation failure', 'Preview refresh must preserve the original mutation failure.');
  } finally {
    delete globalThis.NvsVideoPreviewSizeModeEnum;
  }
  assert(failedPreviewEvents.join(',') === 'seek-after-error', 'Preview must refresh after a mutation rolls back and throws.');

  assert(planTiles([0, 25, 50, 75, 100], 25, 75, 144).length === 2, '144 px must render two 72 px thumbnail tiles.');
  assert(planTiles([0, 25, 50, 75, 100], 50, 100, 288).every((value) => value >= 50), 'Trimmed clips must not use frames before trim-in.');
  assert(Math.min(Math.max(0, 12), 10 - 1) === 9, 'Preview restoration must clamp to the new duration.');

  const queue = new SingleFlightQueue();
  const order = [];
  const first = queue.run('caption:1', async () => { order.push('caption'); return 'caption'; });
  const duplicate = queue.run('caption:1', async () => { throw new Error('duplicate task ran'); });
  const second = queue.run('sticker:1', async () => { order.push('sticker'); return 'sticker'; });
  const sameIdDifferentType = queue.run('video-fx:1', async () => { order.push('video-fx'); return 'video-fx'; });
  assert(first === duplicate, 'Concurrent identical package requests must share one Promise.');
  await Promise.all([first, duplicate, second, sameIdDifferentType]);
  assert(order.join(',') === 'caption,sticker,video-fx', 'Different package types must retain FIFO callback ownership and independent keys.');
  try { await queue.run('retry:1', async () => { throw new Error('expected'); }); } catch {}
  await Promise.resolve();
  assert(!queue.has('retry:1'), 'Failed package requests must leave the in-flight cache for retry.');

  const formatting = readCaptionFormatting({
    getFontFamily: () => 'Inter', getFontSize: () => 32, getWeight: () => 400,
    getBold: () => false, getItalic: () => false, getUnderline: () => false,
    getVerticalLayout: () => true, getTextAlignment: () => 1, getTextVerticalAlignment: () => 2,
    getLetterSpacing: () => 3, getLetterSpacingType: () => 4, getLineSpacing: () => 5,
    getTextColor: () => ({}), getDrawOutline: () => false, getOutlineColor: () => ({}),
    getOutlineWidth: () => 0, getDrawShadow: () => false, getShadowColor: () => ({}),
    getShadowOffset: () => ({}), getShadowFeather: () => 0, getBackgroundColor: () => ({}),
    getBackgroundRadius: () => 0,
  });
  assert(
    formatting.verticalLayout === true && formatting.verticalAlignment === 2 &&
    formatting.letterSpacing === 3 && formatting.letterSpacingType === 4 && formatting.lineSpacing === 5,
    'Caption formatting snapshots must preserve vertical layout/alignment and spacing fields.',
  );

  globalThis.NvsAssetPackageTypeEnum = { CaptionContext: 8, CaptionRenderer: 9, CaptionAnimation: 10 };
  let modularPeriodId = 'period';
  let modularPeriodMs = 700;
  const modularCaption = {
    isModular: () => true, getModularCaptionContextPackageId: () => 'context',
    getModularCaptionRendererPackageId: () => 'renderer', getModularCaptionAnimationPackageId: () => modularPeriodId,
    getModularCaptionAnimationPeroid: () => modularPeriodMs, getModularCaptionInAnimationPackageId: () => '',
    getModularCaptionInAnimationDuration: () => 0, getModularCaptionOutAnimationPackageId: () => '',
    getModularCaptionOutAnimationDuration: () => 0, hasKeyframeList: () => false,
    setCurrentKeyFrameTime: () => undefined, getText: () => 'caption', getInPoint: () => 0, getOutPoint: () => 1_000_000,
    getCaptionTranslation: () => ({}), getScaleX: () => 1, getScaleY: () => 1, getRotationZ: () => 0,
    getFontFamily: () => 'Inter', getFontSize: () => 32, getWeight: () => 400,
    getBold: () => false, getItalic: () => false, getUnderline: () => false,
    getVerticalLayout: () => false, getTextAlignment: () => 0, getTextVerticalAlignment: () => 0,
    getLetterSpacing: () => 0, getLetterSpacingType: () => 0, getLineSpacing: () => 0,
    getTextColor: () => ({}), getDrawOutline: () => false, getOutlineColor: () => ({}),
    getOutlineWidth: () => 0, getDrawShadow: () => false, getShadowColor: () => ({}),
    getShadowOffset: () => ({}), getShadowFeather: () => 0, getBackgroundColor: () => ({}),
    getBackgroundRadius: () => 0,
  };
  const modularSnapshot = snapshotModularCaption(modularCaption);
  assert(
    modularSnapshot.packages.periodAnimation?.id === 'period' && modularSnapshot.packages.periodMs === 700,
    'Modular-caption snapshots must preserve package-animation identity and duration.',
  );
  modularPeriodId = '';
  modularPeriodMs = 0;
  const snapshotWithoutPeriodAnimation = snapshotModularCaption(modularCaption);
  delete globalThis.NvsAssetPackageTypeEnum;
  assert(snapshotWithoutPeriodAnimation.packages.periodMs === undefined, 'A caption without period animation must not persist an invalid zero period.');

  const keyframes = new Map([['Scale X', new Set([100])], ['Scale Y', new Set([100])]]);
  let failScaleYRemoval = true;
  globalThis.NvsKeyFrameFindModeEnum = { After: 1 };
  const keyframeFx = {
    hasKeyframeList: (parameter) => keyframes.get(parameter)?.size > 0,
    findKeyframeTime: (parameter, time, mode) => {
      const values = [...(keyframes.get(parameter) ?? [])].sort((left, right) => left - right);
      return mode === 0 ? (values.includes(time) ? time : -1) : (values.find((value) => value > time) ?? -1);
    },
    getFloatValAtTime: (parameter) => parameter === 'Scale X' ? 1.2 : 1.3,
    removeKeyframeAtTime: (parameter, time) => {
      if (parameter === 'Scale Y' && failScaleYRemoval) return false;
      return keyframes.get(parameter)?.delete(time) ?? false;
    },
    setFloatValAtTime: (parameter, _value, time) => { keyframes.get(parameter)?.add(time); },
  };
  try {
    removeClipTransformKeyframeGroup(keyframeFx, 'scale', 100, 1_000);
    throw new Error('Expected grouped keyframe removal to fail.');
  } catch (error) {
    assert(error.message.includes('complete scale keyframe group'), 'Grouped keyframe removal must expose a partial SDK failure.');
  }
  assert(keyframes.get('Scale X').has(100) && keyframes.get('Scale Y').has(100), 'Failed grouped keyframe removal must restore both axes.');
  failScaleYRemoval = false;
  keyframes.get('Scale Y').delete(100);
  try {
    readGroupedClipTransformKeyframeTimes(keyframeFx);
    throw new Error('Expected incomplete grouped keyframe inspection to fail.');
  } catch (error) {
    assert(error.message.includes('incomplete'), 'Grouped keyframe inspection must reject a half group.');
  } finally {
    delete globalThis.NvsKeyFrameFindModeEnum;
  }

  const slotValues = new Map([
    ['Package Id', 'old-primary'], ['Post Package Id', ''], ['Package Effect In', 0], ['Package Effect Out', 500],
    ['Package2 Id', ''], ['Post Package2 Id', 'old-out'], ['Package2 Effect In', 800], ['Package2 Effect Out', 1_000],
  ]);
  const propertyFx = {
    getStringVal: (key) => slotValues.get(key) ?? '', getFloatVal: (key) => slotValues.get(key) ?? 0,
    setStringVal: (key, value) => { if (value !== 'new-primary') slotValues.set(key, value); },
    setFloatVal: (key, value) => { slotValues.set(key, value); },
  };
  const animationContext = {
    getAssetPackageManager: () => ({ getAssetPackageStatus: () => 1 }),
    getTimelineCurrentPosition: () => 0, lastSeekingFinished: async () => undefined,
    stop: () => undefined, streamingEngineReadyForTimelineModification: async () => undefined,
    seekTimeline: () => true,
  };
  globalThis.NvsAssetPackageStatusEnum = { Ready: 1 };
  globalThis.NvsVideoPreviewSizeModeEnum = { LiveWindowSize: 0 };
  try {
    await setClipPackageAnimations(animationContext, { getDuration: () => 1_000 }, {
      getInPoint: () => 0, getOutPoint: () => 1_000, enablePropertyVideoFx: () => undefined,
      getPropertyVideoFx: () => propertyFx,
    }, { primary: { kind: 'in', packageRef: { id: 'new-primary', type: 0 }, inPointUs: 0, outPointUs: 400, scope: 'source' } });
    throw new Error('Expected package-animation verification to fail.');
  } catch (error) {
    assert(error.message.includes('retain the requested'), 'Package-animation failure must preserve the verification error.');
  } finally {
    delete globalThis.NvsAssetPackageStatusEnum;
    delete globalThis.NvsVideoPreviewSizeModeEnum;
  }
  assert(slotValues.get('Package Id') === 'old-primary' && slotValues.get('Post Package2 Id') === 'old-out', 'Failed package-animation mutation must restore both previous slots.');

  assert(DEFAULT_EDITOR_LAYOUT.timelineLabelWidthPx === 78, 'Default UI label column must remain 78 px.');
  assert(DEFAULT_EDITOR_LAYOUT.timelineTrackHeightPx === 46 && DEFAULT_EDITOR_LAYOUT.timelineTrackGapPx === 7, 'Default UI track density changed.');
  assert(DEFAULT_EDITOR_LAYOUT.timelineRulerHeightPx === 30 && DEFAULT_EDITOR_LAYOUT.timelineThumbnailWidthPx === 72, 'Default UI ruler or thumbnail geometry changed.');
  const uiScale = getTimelineScale(10_000_000, 10_000_000, 2);
  assert(uiScale.scaleUs === 10_000_000 && uiScale.canvasWidthPercent === 200, 'Default UI zoom must expand the canvas without changing Timeline duration.');
  assert(timelinePointerToTimeUs(550, 50, 1_000, uiScale.scaleUs, 10_000_000) === 5_000_000, 'Default UI seek mapping must share the Timeline scale.');
  assert(getTimelineRulerTicks(uiScale.scaleUs, 10_000_000, 2).some(({ major, timeUs }) => major && timeUs === 1_000_000), 'Default UI ruler must retain one-second major ticks at 2x for a ten-second Timeline.');
  const uiTiles = planTimelineThumbnailTiles([{ timestampUs: 0, dataUrl: 'a' }, { timestampUs: 10, dataUrl: 'b' }], 0, 10, 145);
  assert(uiTiles.length === 3, 'Default UI must plan one 72 px thumbnail tile per rendered tile width.');
  const resources = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'test-resources.json'), 'utf8'));
  assert(resources.environment === 'test-only' && resources.productionDefault === false, 'Default remote packages must remain test-only.');
  assert(resources.resources.length === 2, 'The approved caption and sticker test packages must both be registered.');
  console.log(JSON.stringify({ status: 'pass', checks }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
