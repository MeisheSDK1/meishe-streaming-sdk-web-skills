export function inspectMedia(context: NvsStreamingContext, mediaPath: string): NvsAVFileInfo {
  const info = context.getAVFileInfo(mediaPath, 0);
  if (!info) throw new Error('The SDK could not read media metadata.');
  return info;
}

export function startIconFetch(
  context: NvsStreamingContext,
  mediaPath: string,
  timestampUs: number,
  onIcon: (image: ImageData) => void,
): { taskId: number; cancel(): void } {
  const taskId = context.getLocalAVFileIcon(
    mediaPath,
    timestampUs,
    (image: ImageData) => onIcon(image),
  );
  if (taskId === 0) throw new Error('The SDK could not start icon fetching.');
  return {
    taskId,
    cancel: () => context.cancelLocalAVFileIconFetchingTask(taskId),
  };
}

export function startWaveformFetch(
  context: NvsStreamingContext,
  mediaPath: string,
  sampleCountPerGroup: number,
  onWaveform: (left: unknown, right: unknown) => void,
): { taskId: number; cancel(): void } {
  if (sampleCountPerGroup <= 0) throw new Error('sampleCountPerGroup must be positive.');
  const taskId = context.getLocalAVFileWaveformData(
    mediaPath,
    sampleCountPerGroup,
    0,
    -1,
    (left: unknown, right: unknown) => onWaveform(left, right),
  );
  if (taskId === 0) throw new Error('The SDK could not start waveform fetching.');
  return {
    taskId,
    cancel: () => context.cancelLocalAVFileWaveformDataFetchingFetchingTask(taskId),
  };
}
