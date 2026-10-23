import { AssetPackageInstallCoordinator, AssetPackageRequest, AssetPackageRef } from '../packages/asset-package';
import {
  TemplateFootageReplacement,
  createTemplateTimeline,
  selectTemplateAspectRatio,
} from './template-timeline';

export interface TemplatePackageLoadRequest {
  package: Omit<AssetPackageRequest, 'packageType'>;
  replacements: TemplateFootageReplacement[];
  aspectRatio?: number;
  flags?: number;
}

export interface LoadedTemplatePackage {
  packageRef: AssetPackageRef;
  timeline: NvsTimeline;
  remove(): Promise<void>;
}

export async function loadTemplatePackageTimeline(
  context: NvsStreamingContext,
  request: TemplatePackageLoadRequest,
): Promise<LoadedTemplatePackage> {
  for (const replacement of request.replacements) {
    if (!replacement.id || !replacement.path) {
      throw new Error('Every template replacement requires a footage ID and SDK-readable path.');
    }
    if (!replacement.path.startsWith(':/') && !FS.analyzePath(replacement.path).exists) {
      throw new Error(`[missing-external] Prepare template footage in SDK FS: ${replacement.path}`);
    }
  }

  const packageInstaller = new AssetPackageInstallCoordinator(context);
  let packageId = '';
  try {
    packageId = await packageInstaller.install({
      ...request.package,
      packageType: NvsAssetPackageTypeEnum.Template,
    });
  } finally {
    packageInstaller.dispose();
  }
  const packageRef: AssetPackageRef = {
    id: packageId,
    type: NvsAssetPackageTypeEnum.Template,
  };
  if (request.aspectRatio !== undefined) {
    selectTemplateAspectRatio(context, packageRef, request.aspectRatio);
  }
  await context.streamingEngineReadyForTimelineModification();
  const timeline = createTemplateTimeline(
    context,
    packageRef,
    request.replacements,
    request.flags,
  );

  let removed = false;
  return {
    packageRef,
    timeline,
    async remove() {
      if (removed) return;
      await context.streamingEngineReadyForTimelineModification();
      if (!context.removeTimeline(timeline)) throw new Error('The SDK could not remove the template timeline.');
      removed = true;
    },
  };
}
