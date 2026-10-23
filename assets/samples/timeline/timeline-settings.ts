let vuMeterOwned = false;

export interface TimelineSettings {
  renderByZValue?: boolean;
  volumeLeft?: number;
  volumeRight?: number;
  maxAudioStreamsPerVideoTrack?: number;
  defaultCaptionFade?: boolean;
}

export async function configureTimeline(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  settings: TimelineSettings,
): Promise<void> {
  if ((settings.volumeLeft ?? 0) < 0 || (settings.volumeRight ?? 0) < 0) {
    throw new Error('Timeline volume gains cannot be negative.');
  }
  if (
    settings.maxAudioStreamsPerVideoTrack !== undefined &&
    (!Number.isInteger(settings.maxAudioStreamsPerVideoTrack) ||
      settings.maxAudioStreamsPerVideoTrack <= 0 ||
      settings.maxAudioStreamsPerVideoTrack > 8)
  ) {
    throw new Error('The Web editor supports 1 to 8 audio streams per video track.');
  }
  await context.streamingEngineReadyForTimelineModification();
  if (settings.renderByZValue !== undefined) timeline.enableRenderOrderByZValue(settings.renderByZValue);
  if (settings.volumeLeft !== undefined || settings.volumeRight !== undefined) {
    timeline.setVolumeGain(settings.volumeLeft ?? 1, settings.volumeRight ?? 1);
  }
  if (settings.maxAudioStreamsPerVideoTrack !== undefined) {
    timeline.setMaxAudioStreamSupportedOnVideoTrack(settings.maxAudioStreamsPerVideoTrack);
  }
  if (settings.defaultCaptionFade !== undefined) context.setDefaultCaptionFade(settings.defaultCaptionFade);
}

export async function resizeTimeline(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  width: number,
  height: number,
): Promise<void> {
  if (width <= 0 || height <= 0 || width % 4 !== 0 || height % 2 !== 0) {
    throw new Error('Timeline width must be a multiple of 4 and height a multiple of 2.');
  }
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  if (!timeline.changeVideoSize2(width, height)) throw new Error('The SDK could not resize the timeline.');
}

export function observeAudioVuMeter(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  onLevel: (left: number, right: number, timestampUs: number) => void,
): { dispose(): void } {
  if (vuMeterOwned) throw new Error('The SDK audio VU callback is already owned by another observer.');
  const previous = context.onAudioVUMeter;
  vuMeterOwned = true;
  context.onAudioVUMeter = (sourceTimeline, left, right, timestamp) => {
    try {
      previous?.(sourceTimeline, left, right, timestamp);
    } catch (callbackError) {
      console.error('Previous audio VU callback failed:', callbackError);
    }
    if (sourceTimeline === timeline) onLevel(left, right, timestamp);
  };
  context.enableAudioVUMeter(true);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      context.enableAudioVUMeter(false);
      context.onAudioVUMeter = previous;
      vuMeterOwned = false;
    },
  };
}
