import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface CompoundCaptionItem {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: NvsColor;
}

export async function addCompoundCaption(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  packageRef: AssetPackageRef,
  inPointUs: number,
  durationUs: number,
  items: CompoundCaptionItem[],
): Promise<{ caption: NvsTimelineCompoundCaption; remove(): Promise<void> }> {
  if (inPointUs < 0 || durationUs <= 0 || items.length === 0) {
    throw new Error('Compound captions need a non-negative in-point, positive duration, and items.');
  }
  if (inPointUs >= timeline.getDuration()) {
    throw new Error('Compound-caption in-point must be inside a non-empty timeline.');
  }
  requireReadyAssetPackage(context, packageRef, 'compound-caption package');
  await context.streamingEngineReadyForTimelineModification();
  const caption = timeline.addCompoundCaption(inPointUs, durationUs, packageRef.id);
  if (!caption) throw new Error('The SDK could not add the compound caption.');
  if (items.length > caption.getCaptionCount()) {
    timeline.removeCompoundCaption(caption);
    throw new Error('More caption items were supplied than the package contains.');
  }

  try {
    items.forEach((item, index) => {
      if (!item.text || (item.fontSize ?? 1) <= 0) throw new Error('Compound-caption items need text and positive font sizes.');
      caption.setText(index, item.text);
      if (item.fontFamily) caption.setFontFamily(index, item.fontFamily);
      if (item.fontSize !== undefined) caption.setFontSize(index, item.fontSize);
      if (item.color) caption.setTextColor(index, item.color);
    });
  } catch (error) {
    timeline.removeCompoundCaption(caption);
    throw error;
  }
  return {
    caption,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      // The return value is the next compound caption, not a success flag.
      timeline.removeCompoundCaption(caption);
    },
  };
}
