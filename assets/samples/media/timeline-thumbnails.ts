export interface TimelineThumbnail {
  timestamp: number;
  image: ImageData;
}

export interface ThumbnailTile<T> {
  key: string;
  sourceTimestamp: number;
  thumbnail: T;
}

export function planThumbnailTiles<T extends { timestamp: number }>(
  thumbnails: T[],
  trimIn: number,
  trimOut: number,
  renderedWidth: number,
  tileWidth = 72,
): ThumbnailTile<T>[] {
  if (!thumbnails.length || trimOut <= trimIn || renderedWidth <= 0 || tileWidth <= 0) return [];
  const count = Math.max(1, Math.ceil(renderedWidth / tileWidth));
  return Array.from({ length: count }, (_, index) => {
    const sourceTimestamp = trimIn + (trimOut - trimIn) * ((index + 0.5) / count);
    const thumbnail = thumbnails.reduce((nearest, candidate) =>
      Math.abs(candidate.timestamp - sourceTimestamp) < Math.abs(nearest.timestamp - sourceTimestamp)
        ? candidate
        : nearest);
    return { key: `${index}:${thumbnail.timestamp}`, sourceTimestamp, thumbnail };
  });
}

export function fetchTimelineThumbnails(
  context: NvsStreamingContext,
  sourcePath: string,
  duration: number,
  signal: AbortSignal,
  sampleCount = Math.min(12, Math.max(4, Math.ceil(duration / 5_000_000))),
): Promise<TimelineThumbnail[]> {
  const activeTasks = new Set<number>();
  const cancel = () => {
    for (const taskId of activeTasks) context.cancelLocalAVFileIconFetchingTask(taskId);
    activeTasks.clear();
  };
  signal.addEventListener('abort', cancel, { once: true });
  const requests = Array.from({ length: sampleCount }, (_, index) => new Promise<TimelineThumbnail | null>((resolve) => {
    const timestamp = Math.min(duration - 1, Math.max(0, Math.round(duration * (index + 0.5) / sampleCount)));
    let taskId = 0;
    const finish = (value: TimelineThumbnail | null) => {
      if (taskId) activeTasks.delete(taskId);
      resolve(value);
    };
    taskId = context.getLocalAVFileIcon(sourcePath, timestamp, (image: ImageData) => finish(signal.aborted ? null : { timestamp, image }));
    if (!taskId || signal.aborted) {
      if (taskId) context.cancelLocalAVFileIconFetchingTask(taskId);
      finish(null);
    } else activeTasks.add(taskId);
  }));
  return Promise.all(requests).then((items) => {
    signal.removeEventListener('abort', cancel);
    return items.filter((item): item is TimelineThumbnail => item !== null);
  });
}
