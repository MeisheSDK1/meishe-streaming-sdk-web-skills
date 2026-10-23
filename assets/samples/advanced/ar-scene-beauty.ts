import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';
import type { HumanDetectionSession } from './human-detection';

export type MakeupComponent =
  | 'Lip'
  | 'Eyebrow'
  | 'Eyeshadow'
  | 'Eyelash'
  | 'Eyeliner'
  | 'Blusher'
  | 'Shadow'
  | 'Brighten'
  | 'Eyeball';

export interface MakeupLayer {
  component: MakeupComponent;
  packageRef: AssetPackageRef;
  intensity: number;
}

export interface ARSceneBeautyOptions {
  /** Verified mode bitmask, normally image/semi-image/video plus thread mode. */
  detectionMode: number;
  beautyStrength?: number;
  whitening?: number;
  reddening?: number;
  advancedBeautyIntensity?: number;
  matteIntensity?: number;
  defaultBeautyLutPath?: string;
  whiteningLutPath?: string;
  /** 0 standard, 1 standard plus skin mask, 2 male. */
  advancedBeautyType?: 0 | 1 | 2;
  makeup?: MakeupLayer[];
}

function requireUnitValue(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error(`${name} must be in [0, 1].`);
  }
}

export async function addARSceneBeauty(
  session: HumanDetectionSession,
  clip: NvsVideoClip,
  options: ARSceneBeautyOptions,
): Promise<{ effect: NvsVideoFx; remove(): Promise<void> }> {
  session.assertReady();
  if (!Number.isInteger(options.detectionMode) || options.detectionMode <= 0) {
    throw new Error('[unknown] Provide a documented AR Scene detection-mode bitmask.');
  }
  if (!session.supports(NvsHumanDetectionFeatureEnum.FaceLandmark)) {
    throw new Error('[missing-external] AR Scene beauty requires a loaded face-landmark detection model.');
  }
  if (!session.supports(options.detectionMode)) {
    throw new Error('[missing-external] Loaded models do not cover the requested AR Scene detection mode.');
  }
  for (const [name, value] of Object.entries({
    beautyStrength: options.beautyStrength,
    whitening: options.whitening,
    reddening: options.reddening,
    advancedBeautyIntensity: options.advancedBeautyIntensity,
    matteIntensity: options.matteIntensity,
  })) requireUnitValue(value, name);
  if (options.defaultBeautyLutPath && !FS.analyzePath(options.defaultBeautyLutPath).exists) {
    throw new Error(`[missing-external] Provide the beauty LUT in SDK FS: ${options.defaultBeautyLutPath}`);
  }
  if (options.whiteningLutPath && !FS.analyzePath(options.whiteningLutPath).exists) {
    throw new Error(`[missing-external] Provide the whitening LUT in SDK FS: ${options.whiteningLutPath}`);
  }
  for (const layer of options.makeup ?? []) {
    requireUnitValue(layer.intensity, `${layer.component} makeup intensity`);
    if (layer.packageRef.type !== NvsAssetPackageTypeEnum.Makeup) {
      throw new Error(`${layer.component} must reference an NvsAssetPackageTypeEnum.Makeup package.`);
    }
    requireReadyAssetPackage(session.context, layer.packageRef, `${layer.component} makeup package`);
  }
  const advancedBeauty =
    options.advancedBeautyIntensity !== undefined ||
    options.matteIntensity !== undefined ||
    options.advancedBeautyType !== undefined;
  if (advancedBeauty && !session.hasData(NvsHumanDetectionDataTypeEnum.AdvancedBeauty)) {
    throw new Error('[missing-external] Advanced beauty requires its matching AdvancedBeauty detection data file.');
  }
  if (
    (options.makeup?.length ?? 0) > 0 &&
    !session.hasData(NvsHumanDetectionDataTypeEnum.Makeup) &&
    !session.hasData(NvsHumanDetectionDataTypeEnum.Makeup2)
  ) {
    throw new Error('[missing-external] Makeup requires its matching Makeup or Makeup2 detection data file.');
  }

  await session.context.streamingEngineReadyForTimelineModification();
  const effect = clip.appendRawBuiltinFx('AR Scene');
  if (!effect) throw new Error('The SDK could not add the built-in AR Scene effect.');
  try {
    const manipulate = effect.getARSceneManipulate();
    if (!manipulate) throw new Error('AR Scene manipulation is unavailable; verify SDK capability and loaded models.');
    manipulate.setDetectionMode(options.detectionMode);

    const basicBeauty = options.beautyStrength !== undefined || options.whitening !== undefined || options.reddening !== undefined;
    effect.setBooleanVal('Beauty Effect', basicBeauty);
    if (options.beautyStrength !== undefined) effect.setFloatVal('Beauty Strength', options.beautyStrength);
    if (options.whitening !== undefined) effect.setFloatVal('Beauty Whitening', options.whitening);
    effect.setBooleanVal('Whitening Lut Enabled', Boolean(options.whiteningLutPath));
    if (options.whiteningLutPath) effect.setStringVal('Whitening Lut File', options.whiteningLutPath);
    if (options.reddening !== undefined) effect.setFloatVal('Beauty Reddening', options.reddening);
    if (options.defaultBeautyLutPath) {
      effect.setBooleanVal('Default Beauty Enabled', true);
      effect.setStringVal('Default Beauty Lut File', options.defaultBeautyLutPath);
    }

    effect.setBooleanVal('Advanced Beauty Enable', advancedBeauty);
    if (options.advancedBeautyIntensity !== undefined) {
      effect.setFloatVal('Advanced Beauty Intensity', options.advancedBeautyIntensity);
    }
    if (options.matteIntensity !== undefined) {
      effect.setFloatVal('Advanced Beauty Matte Intensity', options.matteIntensity);
    }
    if (options.advancedBeautyType !== undefined) {
      effect.setIntVal('Advanced Beauty Type', options.advancedBeautyType);
    }

    const makeup = options.makeup ?? [];
    effect.setBooleanVal('Makeup Enabled', makeup.length > 0);
    for (const layer of makeup) {
      effect.setStringVal(`Makeup ${layer.component} Package Id`, layer.packageRef.id);
      effect.setFloatVal(`Makeup ${layer.component} Intensity`, layer.intensity);
    }
  } catch (error) {
    clip.removeRawFx(effect.getIndex());
    throw error;
  }

  return {
    effect,
    async remove() {
      session.assertReady();
      await session.context.streamingEngineReadyForTimelineModification();
      if (!clip.removeRawFx(effect.getIndex())) throw new Error('The SDK could not remove the AR Scene effect.');
    },
  };
}
