export interface LiveWindowControllerOptions {
  canvasId: string;
  fillMode?: number;
  backgroundColor?: NvsColor;
  initialPositionUs?: number;
  /** Set only when this controller exclusively owns current engine playback. */
  stopEngineOnDispose?: boolean;
}

export interface LiveWindowController {
  liveWindow: NvsLiveWindow;
  render(positionUs: number): boolean;
  dispose(): void;
}

/** Connect the main project preview during project loading, before exposing editing interactions. */
export function connectLiveWindow(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  options: LiveWindowControllerOptions,
): LiveWindowController {
  const canvas = document.getElementById(options.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`#${options.canvasId} must be a canvas element.`);
  }
  if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Size the LiveWindow canvas before connecting it.');
  }

  const liveWindow = context.createLiveWindow(options.canvasId);
  if (!liveWindow) throw new Error('The SDK could not create the LiveWindow.');

  if (options.fillMode !== undefined) liveWindow.setFillMode(options.fillMode);
  if (options.backgroundColor) liveWindow.setBackgroundColor(options.backgroundColor);

  if (!context.connectTimelineWithLiveWindow(timeline, liveWindow)) {
    context.removeLiveWindow(liveWindow);
    throw new Error('The SDK could not connect the timeline to the LiveWindow.');
  }

  let disposed = false;
  const render = (positionUs: number): boolean => {
    if (disposed) throw new Error('The LiveWindow controller is disposed.');
    if (!Number.isFinite(positionUs)) throw new Error('Render position must be finite.');
    const durationUs = timeline.getDuration();
    if (durationUs <= 0) throw new Error('Cannot seek an empty timeline.');
    const safePositionUs = Math.min(Math.max(0, positionUs), durationUs - 1);
    return context.seekTimeline(
      timeline,
      safePositionUs,
      NvsVideoPreviewSizeModeEnum.LiveWindowSize,
      0,
    );
  };

  if (timeline.getDuration() > 0) {
    const initialSeekStarted = render(options.initialPositionUs ?? 0);
    if (!initialSeekStarted) {
      context.disconnectLiveWindow(liveWindow);
      context.removeLiveWindow(liveWindow);
      throw new Error('The SDK could not start the initial LiveWindow seek.');
    }
  } else if (options.initialPositionUs !== undefined) {
    context.disconnectLiveWindow(liveWindow);
    context.removeLiveWindow(liveWindow);
    throw new Error('Cannot perform the requested initial seek on an empty timeline.');
  }

  return {
    liveWindow,
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (options.stopEngineOnDispose) context.stop();
      context.disconnectLiveWindow(liveWindow);
      context.removeLiveWindow(liveWindow);
    },
  };
}
