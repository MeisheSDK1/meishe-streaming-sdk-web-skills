export async function appendVideoTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
): Promise<NvsVideoTrack> {
  await context.streamingEngineReadyForTimelineModification();
  const track = timeline.appendVideoTrack();
  if (!track) throw new Error('The SDK could not append a video track.');
  return track;
}

export async function insertVideoTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  index: number,
): Promise<NvsVideoTrack> {
  if (!Number.isInteger(index) || index < 0 || index > timeline.videoTrackCount()) {
    throw new Error('Video track insertion index is outside the timeline.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const track = timeline.insertVideoTrack(index);
  if (!track) throw new Error('The SDK could not insert a video track.');
  return track;
}

export async function appendAudioTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
): Promise<NvsAudioTrack> {
  await context.streamingEngineReadyForTimelineModification();
  const track = timeline.appendAudioTrack();
  if (!track) throw new Error('The SDK could not append an audio track.');
  return track;
}

export async function insertAudioTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  index: number,
): Promise<NvsAudioTrack> {
  if (!Number.isInteger(index) || index < 0 || index > timeline.audioTrackCount()) {
    throw new Error('Audio track insertion index is outside the timeline.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const track = timeline.insertAudioTrack(index);
  if (!track) throw new Error('The SDK could not insert an audio track.');
  return track;
}

export async function removeVideoTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  track: NvsVideoTrack,
): Promise<void> {
  await context.streamingEngineReadyForTimelineModification();
  if (!timeline.removeVideoTrack(track.getIndex())) throw new Error('The SDK could not remove the video track.');
}

export async function removeAudioTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  track: NvsAudioTrack,
): Promise<void> {
  await context.streamingEngineReadyForTimelineModification();
  if (!timeline.removeAudioTrack(track.getIndex())) throw new Error('The SDK could not remove the audio track.');
}
