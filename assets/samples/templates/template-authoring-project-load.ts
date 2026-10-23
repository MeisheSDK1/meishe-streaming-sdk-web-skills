import { AssetPackageInstallCoordinator, AssetPackageRequest } from '../packages/asset-package';
import { loadProjectTimeline } from '../persistence/project-persistence';
import { writeTemplateXml } from './template-authoring';

export interface TemplateAuthoringProjectRequest {
  projectPackage: Omit<AssetPackageRequest, 'packageType'>;
  /** SDK FS directory containing all external project media referenced by the project package. */
  resourceDirectory: string;
  /** Install dependent effect/material packages before the project package. */
  requiredPackages?: AssetPackageRequest[];
  /** Set only after media, fonts, models, licenses, and material packages were explicitly verified. */
  externalDependenciesVerified: boolean;
  flags?: number;
}

export interface LoadedTemplateAuthoringProject {
  projectId: string;
  timeline: NvsTimeline;
  writeTemplateXml(aspectRatio: number, templatePackageId: string): Promise<string>;
  remove(): Promise<void>;
}

export async function loadTemplateAuthoringProject(
  context: NvsStreamingContext,
  request: TemplateAuthoringProjectRequest,
): Promise<LoadedTemplateAuthoringProject> {
  if (!request.externalDependenciesVerified) {
    throw new Error(
      '[unknown] Verify every project media file, font, model, license, and material package before loading.',
    );
  }
  if (!request.resourceDirectory || !FS.analyzePath(request.resourceDirectory).exists) {
    throw new Error(`[missing-external] Prepare the project resource directory in SDK FS: ${request.resourceDirectory}`);
  }
  const packageInstaller = new AssetPackageInstallCoordinator(context);
  let projectId = '';
  try {
    for (const dependency of request.requiredPackages ?? []) {
      await packageInstaller.install(dependency);
    }
    projectId = await packageInstaller.install({
      ...request.projectPackage,
      packageType: NvsAssetPackageTypeEnum.Project,
    });
  } finally {
    packageInstaller.dispose();
  }
  const timeline = await loadProjectTimeline(
    context,
    projectId,
    request.resourceDirectory,
    request.flags,
  );

  let removed = false;
  return {
    projectId,
    timeline,
    writeTemplateXml(aspectRatio, templatePackageId) {
      if (removed) throw new Error('The template-authoring project timeline has been removed.');
      return writeTemplateXml(context, timeline, aspectRatio, templatePackageId);
    },
    async remove() {
      if (removed) return;
      await context.streamingEngineReadyForTimelineModification();
      if (!context.removeTimeline(timeline)) throw new Error('The SDK could not remove the project timeline.');
      removed = true;
    },
  };
}
