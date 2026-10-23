export interface PlaybackController {
  seek(positionUs: number): void;
  play(startUs?: number, endUs?: number): void;
  stop(): void;
  getCurrentPosition(): number;
  getState(): number;
  dispose(): void;
}

export interface PlaybackControllerOptions {
  previewSizeMode?: number;
  seekFlags?: number;
  playbackFlags?: number;
  preload?: boolean;
  /** The production editor stops active playback before seeking. Default: true. */
  stopBeforeSeek?: boolean;
  /** Required when seekFlags contains NvsSeekFlagEnum.AllowFastScrubbing. */
  secondsPerPixel?: number;
  /** Set true only when this controller owns the singleton engine playback. */
  stopEngineOnDispose?: boolean;
}

export interface PlaybackEvents {
  onPosition?: (positionUs: number) => void;
  onStopped?: () => void;
  onEOF?: () => void;
  onEngineStateChanged?: (state: number) => void;
  onWebRequestWaitChanged?: (isVideo: boolean, waiting: boolean) => void;
}

export function createPlaybackController(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  events: PlaybackEvents = {},
  options: PlaybackControllerOptions = {},
): PlaybackController {
  const previewSizeMode = options.previewSizeMode ?? NvsVideoPreviewSizeModeEnum.LiveWindowSize;
  const seekFlags = options.seekFlags ?? 0;
  const playbackFlags = options.playbackFlags ?? 0;
  if (!Number.isInteger(seekFlags) || seekFlags < 0 || !Number.isInteger(playbackFlags) || playbackFlags < 0) {
    throw new Error('Seek and playback flags must be non-negative integers.');
  }
  const usesFastScrubbing = (seekFlags & NvsSeekFlagEnum.AllowFastScrubbing) !== 0;
  if (
    usesFastScrubbing &&
    (!Number.isFinite(options.secondsPerPixel) || (options.secondsPerPixel ?? 0) <= 0)
  ) {
    throw new Error('secondsPerPixel is required when AllowFastScrubbing is enabled.');
  }
  const previousPosition = context.onPlaybackTimelinePosition;
  const previousStopped = context.onPlaybackStopped;
  const previousEOF = context.onPlaybackEOF;
  // The public engine-state getter returns a wrapper. Preserve the actual
  // callback slot so ownership checks remain reliable during cleanup.
  const previousEngineState = context._onStreamingEngineStateChanged;
  const previousWebWait = context.onWebRequestWaitStatusChange;

  const handlePosition = (eventTimeline: NvsTimeline, position: number) => {
    try {
      previousPosition?.(eventTimeline, position);
    } catch (callbackError) {
      console.error('Previous playback-position callback failed:', callbackError);
    }
    if (eventTimeline === timeline) events.onPosition?.(position);
  };
  const handleStopped = (eventTimeline: NvsTimeline) => {
    try {
      previousStopped?.(eventTimeline);
    } catch (callbackError) {
      console.error('Previous playback-stopped callback failed:', callbackError);
    }
    if (eventTimeline === timeline) events.onStopped?.();
  };
  const handleEOF = (eventTimeline: NvsTimeline) => {
    try {
      previousEOF?.(eventTimeline);
    } catch (callbackError) {
      console.error('Previous playback-EOF callback failed:', callbackError);
    }
    if (eventTimeline === timeline) events.onEOF?.();
  };
  const handleEngineState = (state: number) => {
    try {
      previousEngineState?.(state);
    } catch (callbackError) {
      console.error('Previous engine-state callback failed:', callbackError);
    }
    events.onEngineStateChanged?.(state);
  };
  const handleWebWait = (isVideo: boolean, waiting: boolean) => {
    try {
      previousWebWait?.(isVideo, waiting);
    } catch (callbackError) {
      console.error('Previous web-request callback failed:', callbackError);
    }
    events.onWebRequestWaitChanged?.(isVideo, waiting);
  };
  context.onPlaybackTimelinePosition = handlePosition;
  context.onPlaybackStopped = handleStopped;
  context.onPlaybackEOF = handleEOF;
  context.onStreamingEngineStateChanged = handleEngineState;
  context.onWebRequestWaitStatusChange = handleWebWait;

  let disposed = false;
  return {
    seek(positionUs) {
      if (disposed) throw new Error('Playback controller is disposed.');
      if (!Number.isFinite(positionUs) || positionUs < 0 || positionUs >= timeline.getDuration()) {
        throw new Error('Seek position is outside the timeline.');
      }
      if (
        (options.stopBeforeSeek ?? true) &&
        context.getStreamingEngineState() === NvsStreamingEngineStateEnum.StreamingEngineStatePlayback
      ) {
        context.stop();
      }
      if (usesFastScrubbing) {
        context.setTimelineScaleForSeek(timeline, options.secondsPerPixel!);
      }
      if (!context.seekTimeline(timeline, positionUs, previewSizeMode, seekFlags)) {
        throw new Error('The SDK rejected the seek operation.');
      }
    },
    play(startUs = 0, endUs = timeline.getDuration()) {
      if (disposed) throw new Error('Playback controller is disposed.');
      const durationUs = timeline.getDuration();
      if (
        durationUs <= 0 ||
        !Number.isFinite(startUs) ||
        !Number.isFinite(endUs) ||
        startUs < 0 ||
        startUs >= durationUs ||
        endUs <= startUs ||
        endUs > durationUs
      ) {
        throw new Error('Playback range must be inside the non-empty timeline.');
      }
      if (!context.playbackTimeline(timeline, startUs, endUs, previewSizeMode, options.preload ?? true, playbackFlags)) {
        throw new Error('The SDK rejected timeline playback.');
      }
    },
    stop() {
      if (disposed) throw new Error('Playback controller is disposed.');
      context.stop();
    },
    getCurrentPosition() {
      if (disposed) throw new Error('Playback controller is disposed.');
      return context.getTimelineCurrentPosition(timeline);
    },
    getState() {
      if (disposed) throw new Error('Playback controller is disposed.');
      return context.getStreamingEngineState();
    },
    dispose() {
      if (disposed) return;
      if (options.stopEngineOnDispose) context.stop();
      if (context.onPlaybackTimelinePosition === handlePosition) {
        context.onPlaybackTimelinePosition = previousPosition;
      }
      if (context.onPlaybackStopped === handleStopped) context.onPlaybackStopped = previousStopped;
      if (context.onPlaybackEOF === handleEOF) context.onPlaybackEOF = previousEOF;
      if (context._onStreamingEngineStateChanged === handleEngineState) {
        context.onStreamingEngineStateChanged = previousEngineState;
      }
      if (context.onWebRequestWaitStatusChange === handleWebWait) {
        context.onWebRequestWaitStatusChange = previousWebWait;
      }
      disposed = true;
    },
  };
}

export function configureTimelineSeekScale(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  secondsPerPixel: number,
): void {
  if (!Number.isFinite(secondsPerPixel) || secondsPerPixel <= 0) {
    throw new Error('Timeline seek scale must be a positive seconds-per-pixel value.');
  }
  context.setTimelineScaleForSeek(timeline, secondsPerPixel);
}

export interface PlaybackRateRegion {
  startUs: number;
  endUs: number;
  rate: number;
  audioGain?: number;
}

export function setPreviewPlaybackRates(
  timeline: NvsTimeline,
  regions: PlaybackRateRegion[],
): void {
  const sorted = [...regions].sort((left, right) => left.startUs - right.startUs);
  sorted.forEach((region, index) => {
    if (
      region.startUs < 0 ||
      region.endUs <= region.startUs ||
      region.endUs > timeline.getDuration() ||
      region.rate <= 0 ||
      (region.audioGain ?? 1) < 0 ||
      (index > 0 && region.startUs < sorted[index - 1].endUs)
    ) {
      throw new Error('Playback-rate regions must be non-overlapping, inside the timeline, and use positive rates.');
    }
  });
  const values = new NvsVectorVal() as NvsVectorVal & { push_back(value: NvsPlaybackRateControlRegion): void };
  sorted.forEach((region) => {
    const value = new NvsPlaybackRateControlRegion();
    value.startTime = region.startUs;
    value.endTime = region.endUs;
    value.playbackRate = region.rate;
    value.audioGain = region.audioGain ?? 1;
    values.push_back(value);
  });
  timeline.setPlaybackRateControl(values);
}
