import type { EditorProjectPlan } from './editor-bootstrap';
import type { NewEditorTimeline } from './editor-session';
import { loadProjectTimeline, type SavedProjectLocation } from '../persistence/project-persistence';

export interface EmptyEditorProjectOptions {
  timeline: Omit<NewEditorTimeline, 'kind'>;
  createDefaultTracks?: (timeline: NvsTimeline, context: NvsStreamingContext) => void | Promise<void>;
}

export function createEmptyEditorProject(options: EmptyEditorProjectOptions): EditorProjectPlan {
  return {
    timeline: { kind: 'new', ...options.timeline },
    restoreTimeline: options.createDefaultTracks,
  };
}

export interface ApplicationXmlProjectAdapter<TProject> {
  /** Download/write the small XML file, validate its schema, resolve assets, and return application data. */
  readProjectXml(context: NvsStreamingContext): Promise<TProject>;
  timelineFromProject(project: TProject): Omit<NewEditorTimeline, 'kind'>;
  /** Rebuild tracks, clips, captions, stickers, effects, and project settings from parsed data. */
  restoreProject(
    project: TProject,
    timeline: NvsTimeline,
    context: NvsStreamingContext,
  ): void | Promise<void>;
  initialPositionUs?: number;
}

export async function loadApplicationXmlProject<TProject>(
  context: NvsStreamingContext,
  adapter: ApplicationXmlProjectAdapter<TProject>,
): Promise<EditorProjectPlan> {
  const project = await adapter.readProjectXml(context);
  const timelineOptions = adapter.timelineFromProject(project);
  return {
    timeline: { kind: 'new', ...timelineOptions },
    restoreTimeline: (timeline, streamingContext) =>
      adapter.restoreProject(project, timeline, streamingContext),
    initialPositionUs: adapter.initialPositionUs,
  };
}

export async function loadSdkNativeProject(
  context: NvsStreamingContext,
  location: SavedProjectLocation,
): Promise<EditorProjectPlan> {
  const timeline = await loadProjectTimeline(context, location.projectId, location.sdkAssetRoot);
  return { timeline: { kind: 'existing', timeline, ownership: 'owned' } };
}
