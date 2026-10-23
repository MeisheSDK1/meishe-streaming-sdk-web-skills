export interface NewEditorTimeline {
  kind: 'new';
  width: number;
  height: number;
  fps?: number;
  sampleRate?: number;
  channelCount?: number;
  timelineFlags?: number;
}

export interface ExistingEditorTimeline {
  kind: 'existing';
  timeline: NvsTimeline;
  /** Loaded project timelines are normally owned; mark borrowed timelines explicitly. */
  ownership?: 'owned' | 'borrowed';
}

export type EditorTimelineSource = NewEditorTimeline | ExistingEditorTimeline;

export interface EditorSessionOptions {
  canvasId: string;
  timeline: EditorTimelineSource;
  fillMode?: number;
}

export interface EditorSession {
  context: NvsStreamingContext;
  timeline: NvsTimeline;
  liveWindow: NvsLiveWindow;
  dispose(): Promise<void>;
}

const RECOMMENDED_WEB_TIMELINE_FLAGS =
  NvsCreateTimelineFlagEnum.DontAddDefaultVideoTransition |
  NvsCreateTimelineFlagEnum.ForceAudioSampleFormatUsed |
  NvsCreateTimelineFlagEnum.RecordingUserOperation |
  NvsCreateTimelineFlagEnum.SyncAudioVideoTrasitionInVideoTrack;

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const canvas = document.getElementById(options.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`#${options.canvasId} must be a canvas element.`);
  }
  if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Size the LiveWindow canvas before creating the editor session.');
  }
  const context = nvsGetStreamingContextInstance();
  const ownsTimeline = options.timeline.kind === 'new' || options.timeline.ownership !== 'borrowed';
  let timeline: NvsTimeline | undefined;
  if (options.timeline.kind === 'existing') {
    timeline = options.timeline.timeline;
  } else {
    const source = options.timeline;
    if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width <= 0 || source.height <= 0 || source.width % 4 !== 0 || source.height % 2 !== 0) {
      throw new Error('Timeline width must be a multiple of 4 and height a multiple of 2.');
    }
    const sampleRate = source.sampleRate ?? 44100;
    if (!Number.isInteger(source.fps ?? 25) || (source.fps ?? 25) <= 0 || ![44100, 48000].includes(sampleRate) || !Number.isInteger(source.channelCount ?? 2) || (source.channelCount ?? 2) <= 0) {
      throw new Error('FPS must be a positive integer, sample rate must be 44100 or 48000, and channel count must be a positive integer.');
    }
    timeline = context.createTimeline(
      new NvsVideoResolution(source.width, source.height),
      new NvsRational(source.fps ?? 25, 1),
      new NvsAudioResolution(sampleRate, source.channelCount ?? 2),
      source.timelineFlags ?? RECOMMENDED_WEB_TIMELINE_FLAGS,
    );
  }
  if (!timeline) throw new Error('Meishe SDK could not create the timeline.');

  const liveWindow = context.createLiveWindow(options.canvasId);
  if (!liveWindow) {
    const creationError = new Error('Meishe SDK could not create the LiveWindow.');
    if (ownsTimeline && !context.removeTimeline(timeline)) {
      throw new AggregateError(
        [creationError, new Error('Meishe SDK could not roll back the editor timeline.')],
        'LiveWindow creation and timeline rollback both failed.',
      );
    }
    throw creationError;
  }
  liveWindow.setFillMode(options.fillMode ?? NvsLiveWindowFillModeEnum.PreserveAspectFit);
  let connectionError: Error | undefined;
  try {
    if (!context.connectTimelineWithLiveWindow(timeline, liveWindow)) {
      connectionError = new Error('Meishe SDK could not connect the timeline to the LiveWindow.');
    }
  } catch (error) {
    connectionError = error instanceof Error
      ? error
      : new Error('Meishe SDK threw while connecting the timeline to the LiveWindow.', { cause: error });
  }
  if (connectionError) {
    const errors: unknown[] = [connectionError];
    try {
      context.removeLiveWindow(liveWindow);
    } catch (error) {
      errors.push(error);
    }
    if (ownsTimeline) {
      try {
        if (!context.removeTimeline(timeline)) throw new Error('Meishe SDK could not roll back the editor timeline.');
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 1) throw new AggregateError(errors, 'Editor session connection and rollback both failed.');
    throw connectionError;
  }

  let liveWindowDisconnected = false;
  let liveWindowRemoved = false;
  let timelineRemoved = !ownsTimeline;
  let disposePromise: Promise<void> | undefined;
  return {
    context,
    timeline,
    liveWindow,
    dispose(): Promise<void> {
      if (liveWindowDisconnected && liveWindowRemoved && timelineRemoved) return Promise.resolve();
      if (disposePromise) return disposePromise;
      disposePromise = (async () => {
        context.stop();
        if (!liveWindowDisconnected) {
          context.disconnectLiveWindow(liveWindow);
          liveWindowDisconnected = true;
        }
        if (!liveWindowRemoved) {
          context.removeLiveWindow(liveWindow);
          liveWindowRemoved = true;
        }
        if (!timelineRemoved) {
          await context.streamingEngineReadyForTimelineModification();
          if (!context.removeTimeline(timeline)) {
            throw new Error('Meishe SDK could not remove the editor timeline.');
          }
          timelineRemoved = true;
        }
      })().finally(() => {
        disposePromise = undefined;
      });
      return disposePromise;
    },
  };
}
