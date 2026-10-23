export interface IntervalClip {
  inPoint: number;
  outPoint: number;
}

export interface UserTrack<TClip extends IntervalClip> {
  id: string;
  clips: TClip[];
}

export function intervalsOverlap(inPoint: number, outPoint: number, clip: IntervalClip): boolean {
  return inPoint < clip.outPoint && outPoint > clip.inPoint;
}

export function selectHighestUserTrack<TClip extends IntervalClip>(
  tracks: UserTrack<TClip>[],
  inPoint: number,
  outPoint: number,
): UserTrack<TClip> | null {
  if (!(outPoint > inPoint)) throw new Error('The inserted interval must have positive duration.');
  const highest = tracks.at(-1);
  return highest && !highest.clips.some((clip) => intervalsOverlap(inPoint, outPoint, clip))
    ? highest
    : null;
}

export function selectHighestReusableLane<TLane>(
  lanes: TLane[],
  conflicts: (lane: TLane) => boolean,
): TLane | null {
  const highest = lanes.at(-1);
  return highest && !conflicts(highest) ? highest : null;
}

export interface EditorTimelineRow {
  id: string;
  group: 'non-media' | 'video' | 'audio';
  creationOrder: number;
}

export function orderEditorTimelineRows<TRow extends EditorTimelineRow>(rows: TRow[]): TRow[] {
  const groupOrder: Record<EditorTimelineRow['group'], number> = { 'non-media': 0, video: 1, audio: 2 };
  return rows.slice().sort((left, right) =>
    groupOrder[left.group] - groupOrder[right.group] || right.creationOrder - left.creationOrder);
}

export async function initializeHiddenBaseTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  frameDuration: number,
): Promise<NvsVideoTrack> {
  if (timeline.videoTrackCount() !== 0) throw new Error('Initialize the hidden base before appending user video tracks.');
  await context.streamingEngineReadyForTimelineModification();
  const track = timeline.appendVideoTrack();
  if (!track) throw new Error('Could not create the hidden base track.');
  const clip = track.appendClip(':/footage/transparent_black.png');
  if (!clip || track.changeOutPoint(0, Math.max(1, frameDuration)) < 0) throw new Error('Could not initialize the hidden base clip.');
  return track;
}

export async function synchronizeHiddenBaseTrack(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  maximumContentOutPoint: number,
  frameDuration: number,
): Promise<void> {
  if (frameDuration <= 0) throw new Error('frameDuration must be positive.');
  await context.streamingEngineReadyForTimelineModification();
  const baseTrack = timeline.getVideoTrackByIndex(0);
  if (!baseTrack) throw new Error('Reserve SDK video track 0 for the hidden base track.');
  let baseClip = baseTrack.getClipByIndex(0);
  if (!baseClip) baseClip = baseTrack.appendClip(':/footage/transparent_black.png');
  if (!baseClip) throw new Error('Could not create the hidden transparent base clip.');
  const result = baseTrack.changeOutPoint(0, Math.max(frameDuration, maximumContentOutPoint));
  if (result < 0) throw new Error('Could not synchronize the hidden base-track duration.');
}
