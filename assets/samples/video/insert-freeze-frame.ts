export interface InsertedFreezeFrame {
  left: NvsVideoClip;
  freeze: NvsVideoClip;
  right: NvsVideoClip;
  timelinePositionUs: number;
  sourcePositionUs: number;
  durationUs: number;
}

export interface FreezeFrameHistory<State> {
  snapshot: () => State;
  restore: (snapshot: State) => Promise<void>;
  commit: (before: State) => void;
}

export interface InsertFreezeFrameRequest<HistoryState, SourceState> {
  context: NvsStreamingContext;
  timeline: NvsTimeline;
  track: NvsVideoTrack;
  clip: NvsVideoClip;
  sourcePath: string;
  timelinePositionUs: number;
  durationUs: number;
  frameDurationUs: number;
  history: FreezeFrameHistory<HistoryState>;
  captureSourceState: (clip: NvsVideoClip) => SourceState;
  restoreCreatedClipState: (state: SourceState, result: InsertedFreezeFrame) => void | Promise<void>;
  synchronizeDuration: () => void | Promise<void>;
}

function seekPreservedPosition(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  positionUs: number,
): void {
  const durationUs = timeline.getDuration();
  if (durationUs <= 0) return;
  const targetUs = Math.min(Math.max(0, positionUs), durationUs - 1);
  if (!context.seekTimeline(timeline, targetUs, NvsVideoPreviewSizeModeEnum.LiveWindowSize, 0)) {
    throw new Error('The SDK could not refresh the preview after the freeze-frame edit.');
  }
}

function freezeSourcePosition(clip: NvsVideoClip, timelinePositionUs: number): number {
  const mappedUs = clip.getClipVariableSpeedCurvesString()
    ? clip.getClipPosByTimelinePosCurvesVariableSpeed(timelinePositionUs)
    : clip.getTrimIn() + (timelinePositionUs - clip.getInPoint()) * clip.getSpeed();
  const positionUs = Math.min(clip.getTrimOut() - 1, Math.max(clip.getTrimIn(), Math.round(mappedUs)));
  if (!Number.isFinite(positionUs) || positionUs < clip.getTrimIn() || positionUs >= clip.getTrimOut()) {
    throw new Error('The Timeline position could not be mapped into the source trim range.');
  }
  return positionUs;
}

/**
 * Inserts one silent freeze-frame segment and shifts only later clips on this video track.
 * The caller owns stable IDs, selection, property/effect copying, and the full history snapshot.
 */
export async function insertFreezeFrameOnTrack<HistoryState, SourceState>(
  request: InsertFreezeFrameRequest<HistoryState, SourceState>,
): Promise<InsertedFreezeFrame> {
  const {
    context,
    timeline,
    track,
    clip,
    sourcePath,
    durationUs,
    frameDurationUs,
    history,
  } = request;
  if (!sourcePath) throw new Error('Provide the SDK-readable source path for the selected video.');
  if (!Number.isFinite(durationUs) || durationUs <= 0) throw new Error('Freeze-frame duration must be positive.');
  if (!Number.isFinite(frameDurationUs) || frameDurationUs <= 0) throw new Error('Frame duration must be positive.');
  if (clip.isClipFreezeFrameEnabled()) throw new Error('Do not insert another freeze segment from an existing freeze segment.');

  const timelinePositionUs = Math.round(request.timelinePositionUs / frameDurationUs) * frameDurationUs;
  if (timelinePositionUs < clip.getInPoint() + frameDurationUs || timelinePositionUs > clip.getOutPoint() - frameDurationUs) {
    throw new Error('The playhead must be inside the selected video with one frame retained on each side.');
  }
  const sourceTrimOutUs = clip.getTrimOut();
  const sourcePositionUs = freezeSourcePosition(clip, timelinePositionUs);
  const previousPositionUs = context.getTimelineCurrentPosition(timeline);
  const before = history.snapshot();
  const sourceState = request.captureSourceState(clip);

  await context.lastSeekingFinished();
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  try {
    if (!track.splitClip(clip.getIndex(), timelinePositionUs)) {
      throw new Error('The SDK could not split the selected video at the playhead.');
    }
    const left = track.getClipByTimelinePosition(timelinePositionUs - 1);
    const right = track.getClipByTimelinePosition(timelinePositionUs);
    if (!left || !right) throw new Error('The SDK did not return both clips after Split.');

    const downstream: Array<{ clip: NvsVideoClip; inPointUs: number; outPointUs: number }> = [];
    for (let index = 0; index < track.getClipCount(); index += 1) {
      const candidate = track.getClipByIndex(index);
      if (candidate && candidate.getInPoint() >= timelinePositionUs) {
        downstream.push({ clip: candidate, inPointUs: candidate.getInPoint(), outPointUs: candidate.getOutPoint() });
      }
    }
    downstream.sort((a, b) => b.inPointUs - a.inPointUs);
    for (const item of downstream) {
      if (!track.moveClipByPositions(item.clip.getIndex(), item.inPointUs + durationUs, false, true)) {
        throw new Error('The SDK could not shift a later clip on the selected video track.');
      }
      if (item.clip.getInPoint() !== item.inPointUs + durationUs || item.clip.getOutPoint() !== item.outPointUs + durationUs) {
        throw new Error('The SDK returned an unexpected range for a shifted video clip.');
      }
    }

    const freezeTrimOutUs = Math.min(sourceTrimOutUs, sourcePositionUs + frameDurationUs);
    if (freezeTrimOutUs <= sourcePositionUs) throw new Error('The selected source position has no readable frame range.');
    const freeze = track.addClip2(sourcePath, timelinePositionUs, sourcePositionUs, freezeTrimOutUs);
    if (!freeze) throw new Error('The SDK could not create the freeze-frame clip.');
    freeze.enableClipFreezeFrame(true);
    freeze.setClipFreezeFrameTrimPosition(sourcePositionUs);
    freeze.disableAudioStreams(true);
    freeze.setVolumeGain(0, 0);
    const freezeOutPointUs = timelinePositionUs + durationUs;
    if (track.changeOutPoint(freeze.getIndex(), freezeOutPointUs) !== freezeOutPointUs) {
      throw new Error('The SDK could not extend the freeze-frame clip to the requested duration.');
    }
    if (!freeze.isClipFreezeFrameEnabled() || freeze.getClipFreezeFrameTrimPosition() !== sourcePositionUs || !freeze.isAudioStreamsDisabled()) {
      throw new Error('The SDK did not round-trip the requested freeze-frame state.');
    }

    const result = { left, freeze, right, timelinePositionUs, sourcePositionUs, durationUs };
    await request.restoreCreatedClipState(sourceState, result);
    await request.synchronizeDuration();
    seekPreservedPosition(context, timeline, previousPositionUs);
    history.commit(before);
    return result;
  } catch (error) {
    try {
      await history.restore(before);
      seekPreservedPosition(context, timeline, previousPositionUs);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Freeze-frame insertion failed and rollback was incomplete.', { cause: rollbackError });
    }
    throw error;
  }
}
