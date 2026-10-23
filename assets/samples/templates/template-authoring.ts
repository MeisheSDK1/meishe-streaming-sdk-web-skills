export const TEMPLATE_ATTACHMENT = {
  isThemePackage: 'MSTemplate-isThemePackage',
  themeTitle: 'MSTemplate-ThemeTitle',
  themeTail: 'MSTemplate-ThemeTail',
  fillTimelineDuration: 'MSTemplate-FillTimelineDuration',
  fillClipDuration: 'MSTemplate-FillClipDuration',
  negativeInPoint: 'MSTemplate-NegativeInPoint',
  negativeOutPoint: 'MSTemplate-NegativeOutPoint',
  overlap: 'MSTemplate-Overlap',
  replaceId: 'MSTemplate-ReplaceId',
  footageId: 'MSTemplate-FootageId',
  footageTags: 'MSTemplate-FootageTags',
  footageName: 'MSTemplate-FootageName',
  footageM3u8Name: 'MSTemplate-FootageM3U8Name',
  footageUrl: 'MSTemplate-FootageUrl',
  footageCanReplace: 'MSTemplate-FootageCanReplace',
  footageNeedReverse: 'MSTemplate-FootageNeedReverse',
  volumeType: 'MSTemplate-VolumeType',
  footageType: 'MSTemplate-FootageType',
  fxGroup: 'MSTemplate-FxGroup',
  bestSeekTime: 'MSTemplate-BestSeekTime',
  clipRawWidth: 'MSTemplate-ClipRawWidth',
  clipRawHeight: 'MSTemplate-ClipRawHeight',
  curveSpeedType: 'MSTemplate-CurveSpeedType',
  trimIn: 'MSTemplate-TrimIn',
  trimOut: 'MSTemplate-TrimOut',
  templateInnerAsset: 'MSTemplate-InnerAsset',
} as const;

type TemplateObject = Pick<NvsProjObj, 'setTemplateAttachment'>;
export type TemplateFootageType = 'video' | 'image' | 'videoImage' | 'audio';

export interface TemplateFootageOptions {
  footageId: string;
  type: TemplateFootageType;
  canReplace?: boolean;
  /** Required for a non-replaceable built-in resource; use only the packaged file name. */
  packagedFileName?: string;
  packagedM3u8FileName?: string;
  sourceUrl?: string;
  tags?: string[];
  needReverse?: boolean;
  volumeType?: string;
  curveSpeedType?: string;
  bestSeekTimeUs?: number;
  rawWidth?: number;
  rawHeight?: number;
  templateInnerAsset?: boolean;
}

export interface TemplateElementTimingOptions {
  fillTimelineDuration?: boolean;
  fillClipDuration?: boolean;
  /** Source-extracted tail-relative range; provide both values in microseconds. */
  negativeInPointUs?: number;
  negativeOutPointUs?: number;
  /** False is used by tail captions/effects that must not overlap generated content. */
  overlap?: boolean;
}

function setAttachment(target: TemplateObject, key: string, value: string | number | boolean): void {
  target.setTemplateAttachment(key, String(value));
}

export function markTemplateFootage(
  clip: NvsVideoClip | NvsAudioClip,
  options: TemplateFootageOptions,
): void {
  if (!options.footageId) throw new Error('Template footage requires a stable, non-empty footageId.');
  const canReplace = options.canReplace ?? true;
  if (!canReplace && !options.packagedFileName) {
    throw new Error('[missing-external] A non-replaceable footage needs its transcoded packaged file name.');
  }
  for (const [label, fileName] of [
    ['packagedFileName', options.packagedFileName],
    ['packagedM3u8FileName', options.packagedM3u8FileName],
  ] as const) {
    if (fileName && /[\\/]/.test(fileName)) {
      throw new Error(`${label} must be a packaged file name without directory separators.`);
    }
  }
  if (
    (options.rawWidth === undefined) !== (options.rawHeight === undefined) ||
    (options.rawWidth !== undefined &&
      (!Number.isFinite(options.rawWidth) || !Number.isFinite(options.rawHeight) ||
        options.rawWidth <= 0 || options.rawHeight! <= 0))
  ) {
    throw new Error('Template raw media width and height must be provided together as positive values.');
  }
  if (options.bestSeekTimeUs !== undefined && (!Number.isFinite(options.bestSeekTimeUs) || options.bestSeekTimeUs < 0)) {
    throw new Error('Template bestSeekTimeUs must be a non-negative microsecond value.');
  }
  if (options.type === 'audio' && clip instanceof NvsVideoClip) {
    throw new Error('Audio template footage must be attached to an NvsAudioClip.');
  }
  if (options.type !== 'audio' && clip instanceof NvsAudioClip) {
    throw new Error('Video/image template footage must be attached to an NvsVideoClip.');
  }
  setAttachment(clip, TEMPLATE_ATTACHMENT.footageId, options.footageId);
  setAttachment(clip, TEMPLATE_ATTACHMENT.footageType, options.type);
  setAttachment(clip, TEMPLATE_ATTACHMENT.footageCanReplace, canReplace);
  setAttachment(clip, TEMPLATE_ATTACHMENT.footageTags, (options.tags ?? []).join(','));
  setAttachment(clip, TEMPLATE_ATTACHMENT.trimIn, clip.getTrimIn());
  setAttachment(clip, TEMPLATE_ATTACHMENT.trimOut, clip.getTrimOut());
  if (options.packagedFileName) setAttachment(clip, TEMPLATE_ATTACHMENT.footageName, options.packagedFileName);
  if (options.packagedM3u8FileName) {
    setAttachment(clip, TEMPLATE_ATTACHMENT.footageM3u8Name, options.packagedM3u8FileName);
  }
  if (options.sourceUrl) setAttachment(clip, TEMPLATE_ATTACHMENT.footageUrl, options.sourceUrl);
  if (options.needReverse) setAttachment(clip, TEMPLATE_ATTACHMENT.footageNeedReverse, true);
  if (options.volumeType) setAttachment(clip, TEMPLATE_ATTACHMENT.volumeType, options.volumeType);
  if (options.curveSpeedType) setAttachment(clip, TEMPLATE_ATTACHMENT.curveSpeedType, options.curveSpeedType);
  if (options.bestSeekTimeUs !== undefined) {
    setAttachment(clip, TEMPLATE_ATTACHMENT.bestSeekTime, options.bestSeekTimeUs);
  }
  if (options.rawWidth !== undefined) {
    setAttachment(clip, TEMPLATE_ATTACHMENT.clipRawWidth, options.rawWidth);
    setAttachment(clip, TEMPLATE_ATTACHMENT.clipRawHeight, options.rawHeight!);
  }
  if (options.templateInnerAsset !== undefined) {
    setAttachment(clip, TEMPLATE_ATTACHMENT.templateInnerAsset, options.templateInnerAsset);
  }
}

export function markTemplateElementTiming(
  target: TemplateObject,
  options: TemplateElementTimingOptions,
): void {
  const hasNegativeIn = options.negativeInPointUs !== undefined;
  const hasNegativeOut = options.negativeOutPointUs !== undefined;
  if (hasNegativeIn !== hasNegativeOut) {
    throw new Error('Provide both negativeInPointUs and negativeOutPointUs for a tail-relative range.');
  }
  if (
    hasNegativeIn &&
    (!Number.isFinite(options.negativeInPointUs) ||
      !Number.isFinite(options.negativeOutPointUs) ||
      options.negativeOutPointUs! <= options.negativeInPointUs!)
  ) {
    throw new Error('Tail-relative template out-point must be finite and greater than its in-point.');
  }
  if (options.fillTimelineDuration !== undefined) {
    setAttachment(target, TEMPLATE_ATTACHMENT.fillTimelineDuration, options.fillTimelineDuration);
  }
  if (options.fillClipDuration !== undefined) {
    setAttachment(target, TEMPLATE_ATTACHMENT.fillClipDuration, options.fillClipDuration);
  }
  if (hasNegativeIn) {
    setAttachment(target, TEMPLATE_ATTACHMENT.negativeInPoint, options.negativeInPointUs!);
    setAttachment(target, TEMPLATE_ATTACHMENT.negativeOutPoint, options.negativeOutPointUs!);
  }
  if (options.overlap !== undefined) setAttachment(target, TEMPLATE_ATTACHMENT.overlap, options.overlap);
}

export function markTemplateEffectGroup(target: TemplateObject, groupName: string): void {
  if (!groupName.trim()) throw new Error('Template effect groups require a non-empty group name.');
  setAttachment(target, TEMPLATE_ATTACHMENT.fxGroup, groupName);
}

export function markReplaceableTemplateElement(
  target: TemplateObject,
  replaceId: string,
  fillTimelineDuration = false,
): void {
  if (!replaceId) throw new Error('A replaceable template element requires a stable replaceId.');
  setAttachment(target, TEMPLATE_ATTACHMENT.replaceId, replaceId);
  if (fillTimelineDuration) markTemplateElementTiming(target, { fillTimelineDuration: true });
}

export function markThemeTemplateRoles(
  timeline: NvsTimeline,
  titleClip?: NvsVideoClip,
  tailClip?: NvsVideoClip,
): void {
  setAttachment(timeline, TEMPLATE_ATTACHMENT.isThemePackage, true);
  if (titleClip) setAttachment(titleClip, TEMPLATE_ATTACHMENT.themeTitle, true);
  if (tailClip) setAttachment(tailClip, TEMPLATE_ATTACHMENT.themeTail, true);
}

export function setTrackAvailableInTheme(track: NvsVideoTrack, available: boolean): void {
  if (!track.setAvailableInTheme(available)) throw new Error('The SDK could not change theme availability for the track.');
}

export async function writeTemplateXml(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  aspectRatio: number,
  packageId: string,
): Promise<string> {
  if (!packageId) throw new Error('Provide a customer-generated stable template package ID.');
  context.stop();
  await context.streamingEngineReadyForTimelineModification();
  const manager = context.getAssetPackageManager();
  if (!manager.writeTemplateXml(timeline, aspectRatio, packageId)) {
    throw new Error('The SDK could not write template XML; verify all required footage attachments.');
  }
  return manager.getAssetPackageRootDir();
}

export function createEmptyTemplateTimeline(
  context: NvsStreamingContext,
  packageId: string,
  width: number,
  height: number,
  fps = 25,
  flags = 0,
): NvsTimeline {
  if (!packageId) throw new Error('Provide a customer-generated stable template package ID.');
  if (width <= 0 || height <= 0 || width % 4 !== 0 || height % 2 !== 0 || fps <= 0) {
    throw new Error('Template timeline width must be a multiple of 4, height a multiple of 2, and FPS positive.');
  }
  const timeline = context.createEmptyTemplateTimeline(
    new NvsVideoResolution(width, height),
    new NvsRational(fps, 1),
    new NvsAudioResolution(44_100, 2),
    packageId,
    flags,
  );
  if (!timeline) throw new Error('The SDK could not create the empty template timeline.');
  return timeline;
}
