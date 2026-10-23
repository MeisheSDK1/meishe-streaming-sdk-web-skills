/** System roots created after WASM readiness. */
export const SDK_FS_ROOTS = [
  'template',
  'project',
  'videofx',
  'animatedsticker',
  'animatedstickerinanimation',
  'animatedstickeroutanimation',
  'animatedstickeranimation',
  'captionstyle',
  'captioncontext',
  'captionrenderer',
  'captioninanimation',
  'captionoutanimation',
  'captionanimation',
  'theme',
  'transition',
  'm3u8',
  'font',
  'compoundcaption',
  'record',
  'model',
  'resources',
  'backgroundimage',
  'interactproject',
  'projectresource',
  'ARScene',
  'facemesh',
  'warp',
  'audiowave',
  'videoimage',
  'lic',
  'dat',
  'makeup',
  'weblocal',
  'localmedia',
] as const;

export type SdkFsRoot = (typeof SDK_FS_ROOTS)[number];

export function assertSdkFsPath(
  path: string,
  allowedRoots: readonly SdkFsRoot[] = SDK_FS_ROOTS,
): SdkFsRoot {
  if (!path.startsWith('/') || path.endsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error('Use an absolute normalized SDK FS path without a trailing slash.');
  }
  const segments = path.slice(1).split('/');
  if (segments.length === 0 || segments.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('SDK FS paths must not contain empty, current, or parent segments.');
  }
  const root = segments[0] as SdkFsRoot;
  if (!allowedRoots.includes(root)) {
    throw new Error(`SDK FS root /${root} is not allowed for this operation.`);
  }
  return root;
}

export function assertSdkFsFilePath(
  path: string,
  allowedRoots?: readonly SdkFsRoot[],
): SdkFsRoot {
  const root = assertSdkFsPath(path, allowedRoots);
  if (path === `/${root}`) throw new Error('Provide a file path below the SDK FS root.');
  return root;
}

export function initializeSdkFsRoots(): void {
  for (const root of SDK_FS_ROOTS) {
    const path = `/${root}`;
    if (!FS.analyzePath(path).exists) FS.mkdir(path);
  }
}

export function assetPackageRoot(type: number): SdkFsRoot {
  const roots = new Map<number, SdkFsRoot>([
    [NvsAssetPackageTypeEnum.VideoFx, 'videofx'],
    [NvsAssetPackageTypeEnum.VideoTransition, 'transition'],
    [NvsAssetPackageTypeEnum.CaptionStyle, 'captionstyle'],
    [NvsAssetPackageTypeEnum.AnimatedSticker, 'animatedsticker'],
    [NvsAssetPackageTypeEnum.ARScene, 'ARScene'],
    [NvsAssetPackageTypeEnum.CompoundCaption, 'compoundcaption'],
    [NvsAssetPackageTypeEnum.CaptionContext, 'captioncontext'],
    [NvsAssetPackageTypeEnum.CaptionRenderer, 'captionrenderer'],
    [NvsAssetPackageTypeEnum.CaptionAnimation, 'captionanimation'],
    [NvsAssetPackageTypeEnum.CaptionInAnimation, 'captioninanimation'],
    [NvsAssetPackageTypeEnum.CaptionOutAnimation, 'captionoutanimation'],
    [NvsAssetPackageTypeEnum.Template, 'template'],
    [NvsAssetPackageTypeEnum.AvatarModel, 'model'],
    [NvsAssetPackageTypeEnum.AnimatedStickerAnimation, 'animatedstickeranimation'],
    [NvsAssetPackageTypeEnum.AnimatedStickerInAnimation, 'animatedstickerinanimation'],
    [NvsAssetPackageTypeEnum.AnimatedStickerOutAnimation, 'animatedstickeroutanimation'],
    [NvsAssetPackageTypeEnum.Makeup, 'makeup'],
    [NvsAssetPackageTypeEnum.FaceMesh, 'facemesh'],
    [NvsAssetPackageTypeEnum.Warp, 'warp'],
    [NvsAssetPackageTypeEnum.Project, 'project'],
  ]);
  const root = roots.get(type);
  if (!root) {
    throw new Error(`No verified FSPath root mapping exists for asset package type ${type}.`);
  }
  return root;
}
