export interface SavedProjectLocation {
  projectId: string;
  sdkAssetRoot: string;
}

export async function writeProjectXml(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  aspectRatio: number,
  projectId: string,
): Promise<SavedProjectLocation> {
  if (!projectId) throw new Error('Provide a stable customer-owned project ID.');
  await context.streamingEngineReadyForTimelineModification();
  const manager = context.getAssetPackageManager();
  if (!manager.writeProjectXml(timeline, aspectRatio, projectId)) {
    throw new Error('The SDK could not write project XML.');
  }
  return { projectId, sdkAssetRoot: manager.getAssetPackageRootDir() };
}

export async function loadProjectTimeline(
  context: NvsStreamingContext,
  projectId: string,
  resourceDirectory: string,
  flags = 0,
): Promise<NvsTimeline> {
  if (!projectId || !resourceDirectory) {
    throw new Error('Project ID and prepared SDK resource directory are required.');
  }
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  const timeline = context.loadProject(projectId, resourceDirectory, flags);
  if (!timeline) throw new Error('The SDK could not load the project timeline.');
  return timeline;
}
