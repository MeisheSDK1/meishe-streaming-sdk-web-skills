import { type AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface ModularCaptionPackages {
  context?: AssetPackageRef;
  renderer?: AssetPackageRef;
  periodAnimation?: AssetPackageRef;
  periodMs?: number;
  inAnimation?: AssetPackageRef;
  inDurationMs?: number;
  outAnimation?: AssetPackageRef;
  outDurationMs?: number;
}

export async function addModularCaption(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  text: string,
  inPointUs: number,
  durationUs: number,
  packages: ModularCaptionPackages,
): Promise<NvsTimelineCaption> {
  if (!text || inPointUs < 0 || durationUs <= 0) {
    throw new Error('Modular captions need text, a non-negative in-point, and a positive duration.');
  }
  if (inPointUs >= timeline.getDuration()) {
    throw new Error('Modular-caption in-point must be inside a non-empty timeline.');
  }
  if (packages.periodAnimation && (packages.inAnimation || packages.outAnimation)) {
    throw new Error('Choose either a period animation or in/out animations, not both.');
  }
  if ((packages.periodMs ?? 1) <= 0 || (packages.inDurationMs ?? 0) < 0 || (packages.outDurationMs ?? 0) < 0) {
    throw new Error('Animation periods must be positive and in/out durations cannot be negative.');
  }
  if (packages.context) requireReadyAssetPackage(context, packages.context, 'caption context package');
  if (packages.renderer) requireReadyAssetPackage(context, packages.renderer, 'caption renderer package');
  if (packages.periodAnimation) {
    requireReadyAssetPackage(context, packages.periodAnimation, 'caption animation package');
  }
  if (packages.inAnimation) {
    requireReadyAssetPackage(context, packages.inAnimation, 'caption in-animation package');
  }
  if (packages.outAnimation) {
    requireReadyAssetPackage(context, packages.outAnimation, 'caption out-animation package');
  }

  await context.streamingEngineReadyForTimelineModification();
  const caption = timeline.addModularCaption(text, inPointUs, durationUs);
  if (!caption) throw new Error('The SDK could not add the modular caption.');
  const fail = (message: string): never => {
    timeline.removeCaption(caption);
    throw new Error(message);
  };
  if (!caption.isModular()) fail('addModularCaption() returned a non-modular caption.');

  if (packages.context && !caption.applyModularCaptionContext(packages.context.id)) {
    fail('The installed caption context could not be applied.');
  }
  if (packages.context && caption.getModularCaptionContextPackageId() !== packages.context.id) {
    fail('The applied caption context package ID does not match the requested package.');
  }
  if (packages.renderer && !caption.applyModularCaptionRenderer(packages.renderer.id)) {
    fail('The installed caption renderer could not be applied.');
  }
  if (packages.renderer && caption.getModularCaptionRendererPackageId() !== packages.renderer.id) {
    fail('The applied caption renderer package ID does not match the requested package.');
  }
  if (packages.periodAnimation) {
    if (!caption.applyModularCaptionAnimation(packages.periodAnimation.id)) {
      fail('The installed caption animation could not be applied.');
    }
    caption.setModularCaptionAnimationPeroid(
      Math.min(packages.periodMs ?? 1000, durationUs / 1000),
    );
    if (caption.getModularCaptionAnimationPackageId() !== packages.periodAnimation.id) {
      fail('The applied period-animation package ID does not match the requested package.');
    }
    if (caption.getModularCaptionAnimationPeroid() !== Math.min(packages.periodMs ?? 1000, durationUs / 1000)) {
      fail('The SDK did not retain the requested modular-caption animation period.');
    }
  } else {
    const ownerDurationMs = durationUs / 1000;
    const inDurationMs = Math.min(packages.inDurationMs ?? 500, ownerDurationMs);
    const outDurationMs = Math.min(
      packages.outDurationMs ?? 500,
      Math.max(0, ownerDurationMs - (packages.inAnimation ? inDurationMs : 0)),
    );
    if (packages.inAnimation) {
      if (!caption.applyModularCaptionInAnimation(packages.inAnimation.id)) {
        fail('The installed caption in-animation could not be applied.');
      }
      // Applying an in-animation can initialize an out duration; reset it before
      // configuring the actual out animation.
      caption.setModularCaptionOutAnimationDuration(0);
      caption.setModularCaptionInAnimationDuration(inDurationMs);
      if (
        caption.getModularCaptionInAnimationPackageId() !== packages.inAnimation.id ||
        caption.getModularCaptionInAnimationDuration() !== inDurationMs
      ) {
        fail('The SDK did not retain the requested modular-caption in-animation.');
      }
    }
    if (packages.outAnimation) {
      if (!caption.applyModularCaptionOutAnimation(packages.outAnimation.id)) {
        fail('The installed caption out-animation could not be applied.');
      }
      caption.setModularCaptionOutAnimationDuration(outDurationMs);
      if (
        caption.getModularCaptionOutAnimationPackageId() !== packages.outAnimation.id ||
        caption.getModularCaptionOutAnimationDuration() !== outDurationMs
      ) {
        fail('The SDK did not retain the requested modular-caption out-animation.');
      }
    }
  }
  return caption;
}
