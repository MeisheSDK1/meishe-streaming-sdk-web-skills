import { removeFromSdkFs, writeBytesToSdkFs } from './media-fs';

export interface MeisheTranscodedM3u8Resource {
  path: string;
  durationUs: number;
  displayWidth: number;
  displayHeight: number;
  dispose(): void;
}

/**
 * Loads only a Meishe-transcoded manifest into SDK FS. Ordinary HLS manifests
 * are not interchangeable, and the referenced media segments stay remote.
 */
export async function createMeisheTranscodedM3u8Resource(
  context: NvsStreamingContext,
  url: string,
  signal?: AbortSignal,
): Promise<MeisheTranscodedM3u8Resource> {
  const response = await fetch(url, { mode: 'cors', signal });
  if (!response.ok) throw new Error(`M3U8 fetch failed with HTTP ${response.status}.`);

  // Preserve the response bytes exactly. response.text() is also possible only
  // when the service contract guarantees a compatible text encoding.
  const manifest = new Uint8Array(await response.arrayBuffer());
  if (manifest.byteLength === 0) throw new Error('The M3U8 manifest is empty.');
  signal?.throwIfAborted();

  const path = `/m3u8/${crypto.randomUUID()}.m3u8`;
  const cleanup = () => removeFromSdkFs(path, ['m3u8']);

  try {
    writeBytesToSdkFs(path, manifest, ['m3u8']);
    signal?.throwIfAborted();
    const info = context.getAVFileInfo(path, 0);
    const video = info?.videoStreamInfo as
      | { width?: number; height?: number; rotation?: number }
      | undefined;
    if (
      !info ||
      info.type !== 0 ||
      !Number.isFinite(info.duration) ||
      info.duration <= 0 ||
      !video ||
      !Number.isFinite(video.width) ||
      (video.width ?? 0) <= 0 ||
      !Number.isFinite(video.height) ||
      (video.height ?? 0) <= 0
    ) {
      throw new Error('The SDK did not recognize a valid Meishe-transcoded M3U8 video.');
    }

    const rotated = Math.abs(video.rotation ?? 0) % 2 === 1;
    let disposed = false;
    return {
      path,
      durationUs: info.duration,
      displayWidth: rotated ? video.height! : video.width!,
      displayHeight: rotated ? video.width! : video.height!,
      dispose() {
        if (disposed) return;
        cleanup();
        disposed = true;
      },
    };
  } catch (error) {
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'M3U8 resource creation and rollback both failed.');
    }
    throw error;
  }
}

export async function addMeisheTranscodedM3u8Video(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  resource: MeisheTranscodedM3u8Resource,
  inPointUs = 0,
): Promise<NvsVideoClip> {
  await context.streamingEngineReadyForTimelineModification();
  const clip = track.addClip(resource.path, inPointUs);
  if (!clip) throw new Error('The SDK could not add the Meishe-transcoded M3U8 video.');
  return clip;
}
