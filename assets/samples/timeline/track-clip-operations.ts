export interface TimedClipInput {
  filePath: string;
  inPointUs: number;
  outPointUs: number;
  trimInUs: number;
  trimOutUs: number;
  speed?: number;
  keepAudioPitch?: boolean;
}

function validateTimedClip(input: TimedClipInput): void {
  if (!input.filePath) throw new Error('Provide an SDK-readable media path.');
  if (input.inPointUs < 0 || input.outPointUs <= input.inPointUs) {
    throw new Error('Timeline outPointUs must be greater than inPointUs.');
  }
  if (input.trimInUs < 0 || input.trimOutUs <= input.trimInUs) {
    throw new Error('Source trimOutUs must be greater than trimInUs.');
  }
  if ((input.speed ?? 1) <= 0) throw new Error('Clip speed must be positive.');
}

export async function addVideoClip(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  input: TimedClipInput,
): Promise<NvsVideoClip> {
  validateTimedClip(input);
  await context.streamingEngineReadyForTimelineModification();
  const clip = track.addClipWithSpeedExt2(
    input.filePath,
    input.inPointUs,
    input.outPointUs,
    input.trimInUs,
    input.trimOutUs,
    input.speed ?? 1,
    input.keepAudioPitch ?? true,
  );
  if (!clip) throw new Error('The SDK could not add the video clip.');
  return clip;
}

export async function addAudioClip(
  context: NvsStreamingContext,
  track: NvsAudioTrack,
  input: TimedClipInput,
): Promise<NvsAudioClip> {
  validateTimedClip(input);
  await context.streamingEngineReadyForTimelineModification();
  const clip = track.addClipWithSpeedExt2(
    input.filePath,
    input.inPointUs,
    input.outPointUs,
    input.trimInUs,
    input.trimOutUs,
    input.speed ?? 1,
    input.keepAudioPitch ?? true,
  );
  if (!clip) throw new Error('The SDK could not add the audio clip.');
  return clip;
}

export async function removeClip(
  context: NvsStreamingContext,
  track: NvsTrack,
  clip: NvsClip,
  keepSpace = false,
): Promise<void> {
  await context.streamingEngineReadyForTimelineModification();
  if (!track.removeClip(clip.getIndex(), keepSpace)) {
    throw new Error('The SDK could not remove the clip.');
  }
}

export async function splitTrackClip(
  context: NvsStreamingContext,
  track: NvsVideoTrack | NvsAudioTrack,
  clipIndex: number,
  splitPointUs: number,
): Promise<void> {
  const clip = track.getClipByIndex(clipIndex);
  if (!clip || splitPointUs <= clip.getInPoint() || splitPointUs >= clip.getOutPoint()) {
    throw new Error('Split point must be strictly inside the selected clip.');
  }
  await context.streamingEngineReadyForTimelineModification();
  if (!track.splitClip(clipIndex, splitPointUs)) throw new Error('The SDK could not split the clip.');
}

export async function moveTrackClip(
  context: NvsStreamingContext,
  track: NvsVideoTrack | NvsAudioTrack,
  clipIndex: number,
  targetTimelinePositionUs: number,
  insertAtTarget = false,
  keepSpace = false,
): Promise<void> {
  if (!track.getClipByIndex(clipIndex) || targetTimelinePositionUs < 0) {
    throw new Error('Provide an existing clip index and a non-negative target position.');
  }
  await context.streamingEngineReadyForTimelineModification();
  if (!track.moveClipByPositions(clipIndex, targetTimelinePositionUs, insertAtTarget, keepSpace)) {
    throw new Error('The SDK could not move the clip to the requested position.');
  }
}

export async function trimClipSource(
  context: NvsStreamingContext,
  clip: NvsVideoClip | NvsAudioClip,
  trimInUs: number,
  trimOutUs: number,
  affectSibling = true,
): Promise<{ trimInUs: number; trimOutUs: number }> {
  if (trimInUs < 0 || trimOutUs <= trimInUs) throw new Error('Trim-out must be greater than trim-in.');
  await context.streamingEngineReadyForTimelineModification();
  const actualTrimIn = clip.changeTrimInPoint(trimInUs, affectSibling);
  const actualTrimOut = clip.changeTrimOutPoint(trimOutUs, affectSibling);
  if (actualTrimOut <= actualTrimIn) throw new Error('The SDK rejected the requested source trim range.');
  return { trimInUs: actualTrimIn, trimOutUs: actualTrimOut };
}

export async function removeTrackRange(
  context: NvsStreamingContext,
  track: NvsVideoTrack | NvsAudioTrack,
  inPointUs: number,
  outPointUs: number,
  affectDuration = false,
): Promise<void> {
  if (inPointUs < 0 || outPointUs <= inPointUs) throw new Error('Track range must have positive duration.');
  await context.streamingEngineReadyForTimelineModification();
  if (!track.removeRange(inPointUs, outPointUs, affectDuration)) {
    throw new Error('The SDK could not remove the requested track range.');
  }
}
