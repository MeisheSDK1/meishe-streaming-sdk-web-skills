export interface TimedObjectSnapshot {
  kind: 'caption' | 'compound-caption' | 'sticker';
  owner: string;
  inPointUs: number;
  outPointUs: number;
  zValue: number;
  text?: string | string[];
  packageId?: string;
}

export interface VideoEffectSnapshot {
  owner: string;
  list: 'normal' | 'raw' | 'timeline';
  index: number;
  type: number;
  builtinName?: string;
  packageId?: string;
  inPointUs?: number;
  outPointUs?: number;
}

export interface ClipSnapshot {
  kind: 'video' | 'audio';
  trackIndex: number;
  clipIndex: number;
  filePath: string;
  inPointUs: number;
  outPointUs: number;
  trimInUs: number;
  trimOutUs: number;
  speed: number;
}

export interface TimelineSnapshot {
  durationUs: number;
  videoTrackCount: number;
  audioTrackCount: number;
  clips: ClipSnapshot[];
  overlays: TimedObjectSnapshot[];
  videoEffects: VideoEffectSnapshot[];
  videoTransitions: Array<{ trackIndex: number; sourceClipIndex: number; type: number; nameOrPackageId: string; durationUs: number }>;
}

type CaptionLike = NvsTimelineCaption | NvsTrackCaption | NvsClipCaption;
type CompoundLike = NvsTimelineCompoundCaption | NvsTrackCompoundCaption | NvsClipCompoundCaption;
type StickerLike = NvsTimelineAnimatedSticker | NvsTrackAnimatedSticker | NvsClipAnimatedSticker;

function collectLinked<T>(first: () => T, next: (value: T) => T): T[] {
  const values: T[] = [];
  let current = first() as T | null;
  while (current) {
    values.push(current);
    current = next(current) as T | null;
  }
  return values;
}

function collectOwnerOverlays(
  ownerName: string,
  captions: CaptionLike[],
  compounds: CompoundLike[],
  stickers: StickerLike[],
): TimedObjectSnapshot[] {
  return [
    ...captions.map((caption) => ({
      kind: 'caption' as const,
      owner: ownerName,
      inPointUs: caption.getInPoint(),
      outPointUs: caption.getOutPoint(),
      zValue: caption.getZValue(),
      text: caption.getText(),
      packageId: caption.getCaptionStylePackageId(),
    })),
    ...compounds.map((caption) => ({
      kind: 'compound-caption' as const,
      owner: ownerName,
      inPointUs: caption.getInPoint(),
      outPointUs: caption.getOutPoint(),
      zValue: caption.getZValue(),
      text: Array.from({ length: caption.getCaptionCount() }, (_, index) => caption.getText(index)),
      packageId: caption.getCaptionStylePackageId(),
    })),
    ...stickers.map((sticker) => ({
      kind: 'sticker' as const,
      owner: ownerName,
      inPointUs: sticker.getInPoint(),
      outPointUs: sticker.getOutPoint(),
      zValue: sticker.getZValue(),
      packageId: sticker.getAnimatedStickerPackageId(),
    })),
  ];
}

function describeVideoEffect(
  owner: string,
  list: 'normal' | 'raw' | 'timeline',
  effect: NvsVideoFx | NvsTimelineVideoFx,
  index: number,
): VideoEffectSnapshot {
  const timelineEffect = effect instanceof NvsTimelineVideoFx;
  const type = timelineEffect ? effect.getTimelineVideoFxType() : effect.getVideoFxType();
  const builtin = type === NvsVideoFxTypeEnum.Builtin;
  return {
    owner,
    list,
    index,
    type,
    builtinName: builtin
      ? timelineEffect ? effect.getBuiltinTimelineVideoFxName() : effect.getBuiltinVideoFxName()
      : undefined,
    packageId: builtin
      ? undefined
      : timelineEffect ? effect.getTimelineVideoFxPackageId() : effect.getVideoFxPackageId(),
    inPointUs: timelineEffect ? effect.getInPoint() : undefined,
    outPointUs: timelineEffect ? effect.getOutPoint() : undefined,
  };
}

export function inspectTimeline(timeline: NvsTimeline): TimelineSnapshot {
  const clips: ClipSnapshot[] = [];
  const overlays: TimedObjectSnapshot[] = [];
  const videoEffects: VideoEffectSnapshot[] = [];
  const videoTransitions: TimelineSnapshot['videoTransitions'] = [];

  overlays.push(...collectOwnerOverlays(
    'timeline',
    collectLinked(() => timeline.getFirstCaption(), (value) => timeline.getNextCaption(value)),
    collectLinked(() => timeline.getFirstCompoundCaption(), (value) => timeline.getNextCompoundCaption(value)),
    collectLinked(() => timeline.getFirstAnimatedSticker(), (value) => timeline.getNextAnimatedSticker(value)),
  ));
  collectLinked(
    () => timeline.getFirstTimelineVideoFx(),
    (value) => timeline.getNextTimelineVideoFx(value),
  ).forEach((effect, index) => videoEffects.push(describeVideoEffect('timeline', 'timeline', effect, index)));

  for (let trackIndex = 0; trackIndex < timeline.videoTrackCount(); trackIndex += 1) {
    const track = timeline.getVideoTrackByIndex(trackIndex);
    overlays.push(...collectOwnerOverlays(
      `video-track:${trackIndex}`,
      collectLinked(() => track.getFirstCaption(), (value) => track.getNextCaption(value)),
      collectLinked(() => track.getFirstCompoundCaption(), (value) => track.getNextCompoundCaption(value)),
      collectLinked(() => track.getFirstAnimatedSticker(), (value) => track.getNextAnimatedSticker(value)),
    ));
    for (let clipIndex = 0; clipIndex < track.getClipCount(); clipIndex += 1) {
      const clip = track.getClipByIndex(clipIndex);
      clips.push({
        kind: 'video', trackIndex, clipIndex, filePath: clip.getFilePath(),
        inPointUs: clip.getInPoint(), outPointUs: clip.getOutPoint(),
        trimInUs: clip.getTrimIn(), trimOutUs: clip.getTrimOut(), speed: clip.getSpeed(),
      });
      const owner = `video-track:${trackIndex}/clip:${clipIndex}`;
      overlays.push(...collectOwnerOverlays(
        owner,
        collectLinked(() => clip.getFirstCaption(), (value) => clip.getNextCaption(value)),
        collectLinked(() => clip.getFirstCompoundCaption(), (value) => clip.getNextCompoundCaption(value)),
        collectLinked(() => clip.getFirstAnimatedSticker(), (value) => clip.getNextAnimatedSticker(value)),
      ));
      for (let index = 0; index < clip.getFxCount(); index += 1) {
        const effect = clip.getFxByIndex(index);
        videoEffects.push(describeVideoEffect(owner, 'normal', effect, effect.getIndex()));
      }
      for (let index = 0; index < clip.getRawFxCount(); index += 1) {
        const effect = clip.getRawFxByIndex(index);
        videoEffects.push(describeVideoEffect(owner, 'raw', effect, effect.getIndex()));
      }
      const transition = track.getTransitionBySourceClipIndex(clipIndex);
      if (transition) {
        const builtin = transition.getVideoTransitionType() === NvsVideoTransitionTypeEnum.Builtin;
        videoTransitions.push({
          trackIndex,
          sourceClipIndex: clipIndex,
          type: transition.getVideoTransitionType(),
          nameOrPackageId: builtin
            ? transition.getBuiltinVideoTransitionName()
            : transition.getVideoTransitionPackageId(),
          durationUs: transition.getVideoTransitionDuration(),
        });
      }
    }
  }

  for (let trackIndex = 0; trackIndex < timeline.audioTrackCount(); trackIndex += 1) {
    const track = timeline.getAudioTrackByIndex(trackIndex);
    for (let clipIndex = 0; clipIndex < track.getClipCount(); clipIndex += 1) {
      const clip = track.getClipByIndex(clipIndex);
      clips.push({
        kind: 'audio', trackIndex, clipIndex, filePath: clip.getFilePath(),
        inPointUs: clip.getInPoint(), outPointUs: clip.getOutPoint(),
        trimInUs: clip.getTrimIn(), trimOutUs: clip.getTrimOut(), speed: clip.getSpeed(),
      });
    }
  }
  return {
    durationUs: timeline.getDuration(),
    videoTrackCount: timeline.videoTrackCount(),
    audioTrackCount: timeline.audioTrackCount(),
    clips,
    overlays,
    videoEffects,
    videoTransitions,
  };
}
