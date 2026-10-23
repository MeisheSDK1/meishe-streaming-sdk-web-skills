export async function trimVideoClip(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  trimInUs: number,
  trimOutUs: number,
  affectSibling = false,
): Promise<{ trimInUs: number; trimOutUs: number }> {
  if (trimInUs < 0 || trimOutUs <= trimInUs) {
    throw new Error('trimOutUs must be greater than trimInUs.');
  }
  await context.streamingEngineReadyForTimelineModification();

  const currentTrimInUs = clip.getTrimIn();
  if (trimInUs > currentTrimInUs) {
    clip.changeTrimOutPoint(trimOutUs, affectSibling);
    clip.changeTrimInPoint(trimInUs, affectSibling);
  } else {
    clip.changeTrimInPoint(trimInUs, affectSibling);
    clip.changeTrimOutPoint(trimOutUs, affectSibling);
  }

  return {
    trimInUs: clip.getTrimIn(),
    trimOutUs: clip.getTrimOut(),
  };
}

export async function splitVideoClip(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  clipIndex: number,
  timelinePositionUs: number,
): Promise<void> {
  const clip = track.getClipByIndex(clipIndex);
  if (!clip) throw new Error(`No video clip exists at index ${clipIndex}.`);
  if (timelinePositionUs <= clip.getInPoint() || timelinePositionUs >= clip.getOutPoint()) {
    throw new Error('The split point must be strictly inside the clip.');
  }
  await context.streamingEngineReadyForTimelineModification();
  if (!track.splitClip(clipIndex, timelinePositionUs)) {
    throw new Error('The SDK could not split the video clip.');
  }
}

export async function moveVideoClip(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  clipIndex: number,
  targetTimelinePositionUs: number,
  insertAtTarget: boolean,
  keepSpace: boolean,
): Promise<void> {
  if (targetTimelinePositionUs < 0) throw new Error('Target position must be non-negative.');
  await context.streamingEngineReadyForTimelineModification();
  if (!track.moveClipByPositions(clipIndex, targetTimelinePositionUs, insertAtTarget, keepSpace)) {
    throw new Error('The SDK could not move the video clip.');
  }
}

export async function shiftVideoClipTrimWindow(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  offsetUs: number,
): Promise<{ trimInUs: number; trimOutUs: number }> {
  if (!Number.isFinite(offsetUs) || clip.getTrimIn() + offsetUs < 0) {
    throw new Error('The trim-window offset would move trim-in before zero.');
  }
  await context.streamingEngineReadyForTimelineModification();
  if (!clip.moveTrimPoint(offsetUs)) {
    throw new Error('The SDK rejected the trim-window shift; verify source duration and current trim range.');
  }
  return { trimInUs: clip.getTrimIn(), trimOutUs: clip.getTrimOut() };
}
