import { BlobSource, Input, MP3, MP4, QTFF, UrlSource, WAVE } from 'mediabunny';

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov']);
const VIDEO_CODECS = new Set(['avc', 'hevc']);
const MAX_VIDEO_PIXELS = 1920 * 1080;
const FRAME_DURATION_US = 40_000;

export interface WebLocalVideoStream {
  duration: number;
  width: number;
  height: number;
  pixelAspectRatioNum: number;
  pixelAspectRatioDen: number;
  displayRotation: number;
}

export interface WebLocalAudioStream {
  duration: number;
  sampleRate: number;
  channelCount: number;
}

export interface WebLocalVideoMetadataBase {
  mediaType: 'video';
  duration: number;
  bitrate: number;
  videoStreams: WebLocalVideoStream[];
  audioStreams: WebLocalAudioStream[];
}

export interface WebLocalVideoMetadata extends WebLocalVideoMetadataBase {
  webLocalFileId: string;
}

export interface WebLocalUrlVideoMetadata extends WebLocalVideoMetadataBase {
  webAssetUrl: string;
}

interface WebLocalVideoResourceBase {
  descriptorPath: string;
  descriptorJson: string;
  dispose(): void;
}

export interface WebLocalVideoResource extends WebLocalVideoResourceBase {
  /** Browser File registrations are session-only and must not be restored from XML alone. */
  sessionOnly: true;
}

export interface WebLocalUrlVideoResource extends WebLocalVideoResourceBase {
  sourceUrl: string;
  /** URL descriptors can be restored, but the remote server must remain CORS/range compatible. */
  sessionOnly: false;
}

export class WebLocalTranscodingRequiredError extends Error {
  readonly transcodingRequired = true;
}

function requireTranscoding(message: string): never {
  throw new WebLocalTranscodingRequiredError(`${message} Use Meishe backend transcoding output instead.`);
}

export function alignWebLocalDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) requireTranscoding('Media duration is invalid.');
  const durationUs = seconds * 1_000_000;
  return durationUs + FRAME_DURATION_US / 2 - ((durationUs + FRAME_DURATION_US / 2) % FRAME_DURATION_US);
}

function assertLocalFileSize(file: File): void {
  const deviceMemoryGiB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (deviceMemoryGiB && file.size > deviceMemoryGiB * 1024 ** 3) {
    requireTranscoding('The local file is larger than the browser-reported device memory.');
  }
}

function requireVideoExtension(name: string): void {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!VIDEO_EXTENSIONS.has(extension)) {
    requireTranscoding('WebLocal video preview accepts only MP4/M4V/MOV entry names.');
  }
}

function normalizeRemoteVideoUrl(sourceUrl: string): string {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    requireTranscoding('WebLocal URL media requires an absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    requireTranscoding('WebLocal URL media requires an HTTP(S) URL without embedded credentials.');
  }
  return url.href;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000 / 60));
}

async function inspectWebLocalVideoInput(input: Input): Promise<WebLocalVideoMetadataBase> {
  try {
    const format = await input.getFormat();
    if (format.name === 'QuickTime File Format') {
      requireTranscoding('QuickTime/MOV media is not supported by this WebLocal path.');
    }

    const videoStreams: WebLocalVideoStream[] = [];
    const audioStreams: WebLocalAudioStream[] = [];
    let bitrate = 0;
    const tracks = await input.getTracks();
    if (tracks.length === 0) requireTranscoding('The media contains no readable tracks.');

    for (const track of tracks) {
      const codec = await track.getCodec();
      if (!codec) requireTranscoding('A media track has an unknown codec.');
      const duration = alignWebLocalDuration(await track.computeDuration());
      // Limit packet inspection so metadata extraction does not scan a large file in full.
      await yieldToBrowser();
      const stats = await track.computePacketStats(100);
      bitrate += stats.averageBitrate;

      if (track.isVideoTrack()) {
        if (!VIDEO_CODECS.has(codec)) requireTranscoding(`Video codec ${codec} is not supported.`);
        const width = await track.getCodedWidth();
        const height = await track.getCodedHeight();
        if (width * height > MAX_VIDEO_PIXELS) {
          requireTranscoding('WebLocal video dimensions exceed 1920x1080.');
        }
        const pixelAspectRatio = await track.getPixelAspectRatio();
        videoStreams.push({
          duration,
          width,
          height,
          pixelAspectRatioNum: pixelAspectRatio.num,
          pixelAspectRatioDen: pixelAspectRatio.den,
          displayRotation: await track.getRotation(),
        });
      } else if (track.isAudioTrack()) {
        audioStreams.push({
          duration,
          sampleRate: await track.getSampleRate(),
          channelCount: await track.getNumberOfChannels(),
        });
      }
    }

    if (videoStreams.length === 0) requireTranscoding('The selected media has no video track.');
    return {
      mediaType: 'video',
      duration: alignWebLocalDuration(await input.computeDuration()),
      bitrate: Math.max(0, Math.round(bitrate)),
      videoStreams,
      audioStreams,
    };
  } catch (error) {
    if (error instanceof WebLocalTranscodingRequiredError) throw error;
    throw new WebLocalTranscodingRequiredError(
      `Media metadata parsing failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    input.dispose();
  }
}

export async function inspectWebLocalVideo(file: File): Promise<WebLocalVideoMetadataBase> {
  requireVideoExtension(file.name);
  assertLocalFileSize(file);
  return inspectWebLocalVideoInput(new Input({
    source: new BlobSource(file),
    formats: [MP4, QTFF, MP3, WAVE],
  }));
}

export async function inspectWebLocalVideoUrl(sourceUrl: string): Promise<{
  sourceUrl: string;
  metadata: WebLocalVideoMetadataBase;
}> {
  const normalizedUrl = normalizeRemoteVideoUrl(sourceUrl);
  const metadata = await inspectWebLocalVideoInput(new Input({
    source: new UrlSource(normalizedUrl),
    formats: [MP4, QTFF, MP3, WAVE],
  }));
  return { sourceUrl: normalizedUrl, metadata };
}

function writeWebLocalDescriptor(
  context: NvsStreamingContext,
  descriptorJson: string,
  releaseSource: () => void,
): { descriptorPath: string; cleanup(): void } {
  const descriptorPath = `/localmedia/${crypto.randomUUID()}.weblocal`;
  let descriptorRemoved = false;
  let sourceReleased = false;
  const cleanup = () => {
    const errors: unknown[] = [];
    if (!descriptorRemoved) {
      try {
        if (FS.analyzePath(descriptorPath).exists) FS.unlink(descriptorPath);
        descriptorRemoved = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (!sourceReleased) {
      try {
        releaseSource();
        sourceReleased = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'WebLocal resource cleanup failed.');
  };
  try {
    FS.writeFile(descriptorPath, descriptorJson);
    const fileInfo = context.getAVFileInfo(descriptorPath, 0);
    if (!fileInfo || fileInfo.type !== 0 || fileInfo.duration <= 0) {
      requireTranscoding('The SDK rejected the generated WebLocal descriptor.');
    }
  } catch (error) {
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'WebLocal descriptor creation and rollback both failed.');
    }
    throw error;
  }
  return { descriptorPath, cleanup };
}

export async function createWebLocalVideo(
  context: NvsStreamingContext,
  file: File,
): Promise<WebLocalVideoResource> {
  const parsed = await inspectWebLocalVideo(file);
  const webLocalFileId = context.registerLocalFile(file);
  if (!webLocalFileId) requireTranscoding('The SDK could not register the browser File.');

  const descriptorJson = JSON.stringify({ ...parsed, webLocalFileId } satisfies WebLocalVideoMetadata);
  // Only the small JSON descriptor belongs in SDK FS; never write the video bytes here.
  const { descriptorPath, cleanup } = writeWebLocalDescriptor(
    context,
    descriptorJson,
    () => {
      if (!context.unregisterLocalFile(webLocalFileId)) {
        throw new Error('The SDK could not unregister the browser File.');
      }
    },
  );

  let disposed = false;
  return {
    descriptorPath,
    descriptorJson,
    sessionOnly: true,
    dispose() {
      if (disposed) return;
      cleanup();
      disposed = true;
    },
  };
}

export async function createWebLocalVideoFromUrl(
  context: NvsStreamingContext,
  sourceUrl: string,
): Promise<WebLocalUrlVideoResource> {
  const inspected = await inspectWebLocalVideoUrl(sourceUrl);
  const descriptorJson = JSON.stringify({
    ...inspected.metadata,
    webAssetUrl: inspected.sourceUrl,
  } satisfies WebLocalUrlVideoMetadata);
  const { descriptorPath, cleanup } = writeWebLocalDescriptor(context, descriptorJson, () => undefined);

  let disposed = false;
  return {
    descriptorPath,
    descriptorJson,
    sourceUrl: inspected.sourceUrl,
    sessionOnly: false,
    dispose() {
      if (disposed) return;
      cleanup();
      disposed = true;
    },
  };
}

export async function addWebLocalVideo(
  context: NvsStreamingContext,
  track: NvsVideoTrack,
  resource: WebLocalVideoResource | WebLocalUrlVideoResource,
  inPointUs = 0,
): Promise<NvsVideoClip> {
  await context.streamingEngineReadyForTimelineModification();
  const clip = track.addClip(resource.descriptorPath, inPointUs);
  if (!clip) requireTranscoding('The SDK could not add the WebLocal video to the track.');
  return clip;
}
