import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface BasicCaptionOptions {
  text: string;
  inPointUs: number;
  durationUs: number;
  stylePackage?: AssetPackageRef;
  fontFamily?: string;
  fontSize?: number;
  textColor?: NvsColor;
  outlineWidth?: number;
  translation?: NvsPointF;
}

export async function addBasicCaption(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  options: BasicCaptionOptions,
): Promise<{ caption: NvsTimelineCaption; remove(): Promise<void> }> {
  if (!options.text || options.inPointUs < 0 || options.durationUs <= 0) {
    throw new Error('Caption text, a non-negative in-point, and a positive duration are required.');
  }
  if (options.inPointUs >= timeline.getDuration()) {
    throw new Error('Caption in-point must be inside a non-empty timeline.');
  }
  if ((options.fontSize ?? 1) <= 0 || (options.outlineWidth ?? 0) < 0) {
    throw new Error('Font size must be positive and outline width cannot be negative.');
  }
  if (options.stylePackage) requireReadyAssetPackage(context, options.stylePackage, 'caption style package');
  await context.streamingEngineReadyForTimelineModification();
  const caption = timeline.addCaption(
    options.text,
    options.inPointUs,
    options.durationUs,
    options.stylePackage?.id ?? '',
    false,
  );
  if (!caption) throw new Error('The SDK could not add the caption.');

  try {
    if (options.fontFamily) caption.setFontFamily(options.fontFamily);
    if (options.fontSize !== undefined) caption.setFontSize(options.fontSize);
    if (options.textColor) caption.setTextColor(options.textColor);
    if (options.outlineWidth !== undefined) {
      caption.setDrawOutline(options.outlineWidth > 0);
      caption.setOutlineWidth(options.outlineWidth);
    }
    if (options.translation) caption.setCaptionTranslation(options.translation);
  } catch (error) {
    timeline.removeCaption(caption);
    throw error;
  }

  return {
    caption,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      // The return value is the next caption, not a success flag.
      timeline.removeCaption(caption);
    },
  };
}

export async function replaceCaptionStyle(
  context: NvsStreamingContext,
  caption: NvsCaption,
  stylePackage: AssetPackageRef | null,
  useDefaultAssetParameters = true,
): Promise<void> {
  if (stylePackage) requireReadyAssetPackage(context, stylePackage, 'caption style package');
  await context.streamingEngineReadyForTimelineModification();
  if (!caption.applyCaptionStyle(stylePackage?.id ?? '', useDefaultAssetParameters ? 1 : 0)) {
    throw new Error('The SDK could not apply the caption style.');
  }
}
