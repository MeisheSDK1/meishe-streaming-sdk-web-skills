import { requireAuthorizedCapabilities, type WebEditingCapability } from './capability-gate';
import {
  createEditorSession,
  type EditorSession,
  type EditorTimelineSource,
} from './editor-session';
import { resumeAudioContextOnUserGesture, type AudioContextResumeController } from './resume-audio-context';
import type { AppliedSdkRuntimeEnvironment } from './runtime-environment';
import type { StartedMeisheSdk } from './sdk-startup';
import { setLiveWindowCanvasSize } from '../live-window/canvas-resize';
import {
  createPlaybackController,
  type PlaybackController,
  type PlaybackControllerOptions,
  type PlaybackEvents,
} from '../timeline/playback-controller';
import { configureTimeline, type TimelineSettings } from '../timeline/timeline-settings';

export interface EditorBootstrapOptions {
  /** Promise already started by startMeisheSdkForProjectLoad() during editor/project loading. */
  sdkInitialization: Promise<StartedMeisheSdk>;
  /** Register project-owned SDK/context/package callbacks before resolving project resources. */
  initializeContext?: (context: NvsStreamingContext) => void | (() => void);
  /** Read/create project metadata before Timeline/LiveWindow creation. Never call this from an edit interaction. */
  loadProject(context: NvsStreamingContext): Promise<EditorProjectPlan>;
  canvasId: string;
  canvasCssWidth: number;
  canvasCssHeight: number;
  pixelRatio?: number;
  requiredCapabilities?: readonly WebEditingCapability[];
  playbackEvents?: PlaybackEvents;
  playback?: PlaybackControllerOptions;
  resumeAudioOnUserGesture?: boolean;
}

export interface EditorProjectPlan {
  timeline: EditorTimelineSource;
  timelineSettings?: TimelineSettings;
  /** Rebuild parsed project data, or optionally create application-required empty-project tracks. */
  restoreTimeline?: (timeline: NvsTimeline, context: NvsStreamingContext) => void | Promise<void>;
  initialPositionUs?: number;
}

export interface BootstrappedEditor {
  runtimeEnvironment: AppliedSdkRuntimeEnvironment;
  session: EditorSession;
  playback: PlaybackController;
  audioResume?: AudioContextResumeController;
  dispose(): Promise<void>;
}

const activeCanvasSessions = new Set<string>();

/**
 * Framework-neutral initialization order extracted from the production editor:
 * LocalStorage environment -> SDK/WASM -> context/resources/auth -> capability gate
 * -> SDK FS -> canvas -> timeline/LiveWindow -> project content -> initial seek.
 */
export async function loadEditorProject(options: EditorBootstrapOptions): Promise<BootstrappedEditor> {
  if (activeCanvasSessions.has(options.canvasId)) {
    throw new Error(`An editor project session is already loading or active for #${options.canvasId}.`);
  }
  activeCanvasSessions.add(options.canvasId);
  let context: NvsStreamingContext;
  let runtimeEnvironment: AppliedSdkRuntimeEnvironment;
  let audioResume: AudioContextResumeController | undefined;
  let disposeContextCallbacks: (() => void) | undefined;
  let session: EditorSession | undefined;
  let playback: PlaybackController | undefined;
  let playbackDisposed = false;
  let audioResumeDisposed = false;
  let contextCallbacksDisposed = false;
  let sessionDisposed = false;

  const disposeOwnedResources = async (): Promise<void> => {
    const errors: unknown[] = [];
    if (playback && !playbackDisposed) {
      try {
        playback.dispose();
        playbackDisposed = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (audioResume && !audioResumeDisposed) {
      try {
        audioResume.dispose();
        audioResumeDisposed = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (disposeContextCallbacks && !contextCallbacksDisposed) {
      try {
        disposeContextCallbacks();
        contextCallbacksDisposed = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (session && !sessionDisposed) {
      try {
        await session.dispose();
        sessionDisposed = true;
      } catch (error) {
        errors.push(error);
      }
    }

    const fullyDisposed =
      (!playback || playbackDisposed) &&
      (!audioResume || audioResumeDisposed) &&
      (!disposeContextCallbacks || contextCallbacksDisposed) &&
      (!session || sessionDisposed);
    if (fullyDisposed) activeCanvasSessions.delete(options.canvasId);
    if (errors.length) throw new AggregateError(errors, 'Editor resource cleanup failed; retry disposal before reusing the canvas.');
  };

  try {
    ({ context, runtimeEnvironment } = await options.sdkInitialization);
    audioResume = options.resumeAudioOnUserGesture === false
      ? undefined
      : resumeAudioContextOnUserGesture();
    requireAuthorizedCapabilities(context, options.requiredCapabilities ?? []);
    disposeContextCallbacks = options.initializeContext?.(context) ?? undefined;
    const project = await options.loadProject(context);

    const canvas = document.getElementById(options.canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`#${options.canvasId} must be a canvas element.`);
    }
    setLiveWindowCanvasSize(
      canvas,
      options.canvasCssWidth,
      options.canvasCssHeight,
      options.pixelRatio,
    );
    session = createEditorSession({
      canvasId: options.canvasId,
      timeline: project.timeline,
    });
    if (project.timelineSettings) {
      await configureTimeline(context, session.timeline, project.timelineSettings);
    }
    if (project.restoreTimeline) {
      await context.streamingEngineReadyForTimelineModification();
      await project.restoreTimeline(session.timeline, context);
    }

    playback = createPlaybackController(
      context,
      session.timeline,
      options.playbackEvents,
      options.playback,
    );
    const durationUs = session.timeline.getDuration();
    if (durationUs > 0) {
      const positionUs = project.initialPositionUs ?? 0;
      playback.seek(Math.min(positionUs, durationUs - 1));
    } else if (project.initialPositionUs !== undefined) {
      throw new Error('Cannot perform the requested initial seek on an empty timeline.');
    }

    let disposePromise: Promise<void> | undefined;
    return {
      runtimeEnvironment,
      session,
      playback,
      audioResume,
      dispose() {
        if (disposePromise) return disposePromise;
        disposePromise = disposeOwnedResources().finally(() => {
          disposePromise = undefined;
        });
        return disposePromise;
      },
    };
  } catch (error) {
    try {
      await disposeOwnedResources();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Editor project loading failed and cleanup was incomplete; reload before reusing the canvas.',
      );
    }
    throw error;
  }
}
