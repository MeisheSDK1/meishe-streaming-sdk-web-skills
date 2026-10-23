function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '&#10;');
}

export interface TextMaskStoryboardOptions {
  sceneWidth: number;
  sceneHeight: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  ownerInPointUs: number;
  ownerDurationUs: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  letterSpacing?: number;
  lineSpacing?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalLayout?: boolean;
  translationX?: number;
  translationY?: number;
  scaleX?: number;
  scaleY?: number;
  rotationZ?: number;
}

export interface VideoTextMaskEffectOptions extends TextMaskStoryboardOptions {
  inverse?: boolean;
  featherWidth?: number;
  ignoreBackground?: boolean;
}

export function buildTextMaskStoryboard(options: TextMaskStoryboardOptions): string {
  if (
    options.sceneWidth <= 0 ||
    options.sceneHeight <= 0 ||
    options.fontSize <= 0 ||
    options.ownerInPointUs < 0 ||
    options.ownerDurationUs <= 0 ||
    !options.text.trim() ||
    !options.fontFamily.trim()
  ) {
    throw new Error('Text-mask scene, text, font, in-point, and duration values are invalid.');
  }
  const fontFamily = options.fontFamily.split(' [')[0];
  // The Web editor's storyboard time attributes use milliseconds, while SDK
  // timeline/owner APIs use microseconds.
  const clipStartMs = options.ownerInPointUs / 1000;
  const clipDurationMs = options.ownerDurationUs / 1000;
  return `<?xml version="1.0" encoding="UTF-8"?>
<storyboard sceneWidth="${options.sceneWidth}" sceneHeight="${options.sceneHeight}">
  <textTrack source="${escapeXmlAttribute(options.text.trim())}" fontFamily="${escapeXmlAttribute(fontFamily)}"
    height="${options.fontSize}" bold="${Number(options.bold ?? false)}" italic="${Number(options.italic ?? false)}"
    underline="${Number(options.underline ?? false)}" clipStart="${clipStartMs}" clipDuration="${clipDurationMs}"
    repeat="true" letterSpacingType="absolute" letterSpacing="${options.letterSpacing ?? 0}"
    lineSpacing="${options.lineSpacing ?? 0}" textAlign="${options.textAlign ?? 'left'}"
    verticalLayout="${Number(options.verticalLayout ?? false)}">
    <effect name="transform">
      <param name="scaleX" value="${options.scaleX ?? 1}"/>
      <param name="scaleY" value="${options.scaleY ?? 1}"/>
      <param name="rotationZ" value="${options.rotationZ ?? 0}"/>
      <param name="transX" value="${options.translationX ?? 0}"/>
      <param name="transY" value="${options.translationY ?? 0}"/>
    </effect>
  </textTrack>
</storyboard>`;
}

export async function setRegionalTextMask(
  context: NvsStreamingContext,
  effect: NvsFx,
  options: TextMaskStoryboardOptions,
): Promise<string> {
  await context.streamingEngineReadyForTimelineModification();
  const storyboard = buildTextMaskStoryboard(options);
  effect.setRegional(true);
  effect.setIgnoreBackground(true);
  // This is the Web 3.16.0 runtime parameter used by the editor source. It is
  // not the differently named parameter shown by some cross-platform docs.
  effect.setStringVal('Region Storyboard Description String', storyboard);
  return storyboard;
}

/**
 * Creates the complete verified Raw video-text-mask effect and rolls it back on failure.
 * Preserve the SDK Timeline position before calling, then seek that retained position after
 * success so the connected LiveWindow renders the new mask.
 */
export async function addVideoTextMaskEffect(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  options: VideoTextMaskEffectOptions,
): Promise<NvsVideoFx> {
  const featherWidth = options.featherWidth ?? 0;
  if (!Number.isFinite(featherWidth) || featherWidth < 0) {
    throw new Error('Text-mask feather width must be a non-negative finite value.');
  }
  const storyboard = buildTextMaskStoryboard(options);
  await context.streamingEngineReadyForTimelineModification();
  const effect = clip.appendRawBuiltinFx('Mosaic');
  if (!effect) throw new Error('The SDK could not add the built-in Mosaic text-mask effect.');
  try {
    effect.setAbsoluteTimeUsed(true);
    effect.setRegional(true);
    effect.setIgnoreBackground(options.ignoreBackground ?? true);
    effect.setInverseRegion(options.inverse ?? false);
    effect.setRegionalFeatherWidth(featherWidth);
    effect.setFloatVal('Unit Size', 0);
    effect.setStringVal('Region Storyboard Description String', storyboard);
    return effect;
  } catch (error) {
    clip.removeRawFx(effect.getIndex());
    throw error;
  }
}
