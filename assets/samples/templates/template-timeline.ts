import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';
import { createSdkVector, ReadonlySdkVector, sdkVectorToArray } from '../utils/sdk-vector';

export interface TemplateFootageReplacement {
  id: string;
  path: string;
}

export function selectTemplateAspectRatio(
  context: NvsStreamingContext,
  templatePackage: AssetPackageRef,
  aspectRatio: number,
): void {
  requireReadyAssetPackage(context, templatePackage, 'template package');
  if (!context.getAssetPackageManager().changeTemplateAspectRatio(templatePackage.id, aspectRatio)) {
    throw new Error('The template package does not support the requested aspect ratio.');
  }
}

function collectTemplateFootages(
  footage: NvsTemplateFootageDesc,
  output: NvsTemplateFootageDesc[],
): void {
  const children = sdkVectorToArray(
    footage.timelineClipFootages as unknown as ReadonlySdkVector<NvsTemplateFootageDesc>,
  );
  if (children.length > 0) {
    children.forEach((child) => collectTemplateFootages(child, output));
  } else if (footage.canReplace) {
    output.push(footage);
  }
}

export function createTemplateTimeline(
  context: NvsStreamingContext,
  templatePackage: AssetPackageRef,
  replacements: TemplateFootageReplacement[],
  flags = 0,
): NvsTimeline {
  const manager = context.getAssetPackageManager();
  requireReadyAssetPackage(context, templatePackage, 'template package');
  const roots = manager.getTemplateFootages(templatePackage.id);
  if (!roots) throw new Error('The SDK did not return template footage descriptors.');
  const replaceable: NvsTemplateFootageDesc[] = [];
  sdkVectorToArray(roots as unknown as ReadonlySdkVector<NvsTemplateFootageDesc>)
    .forEach((footage) => collectTemplateFootages(footage, replaceable));

  const byId = new Map(replacements.map((item) => [item.id, item.path]));
  const missing = replaceable.filter((item) => !byId.get(item.id));
  if (missing.length) {
    throw new Error(`Missing template footage replacements: ${missing.map((item) => item.id).join(', ')}`);
  }
  const values = createSdkVector(
    replaceable.map((item) => ({ id: item.id, path: byId.get(item.id)! })),
  );
  const timeline = context.createTemplateTimeline(templatePackage.id, values, flags);
  if (!timeline) throw new Error('The SDK could not create the template timeline.');
  return timeline;
}

export async function applyAdaptiveThemeTemplate(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  templatePackage: AssetPackageRef,
): Promise<void> {
  requireReadyAssetPackage(context, templatePackage, 'adaptive theme template package');
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  if (!timeline.applyThemeTemplate(templatePackage.id)) {
    throw new Error('The SDK rejected the adaptive theme template.');
  }
}
