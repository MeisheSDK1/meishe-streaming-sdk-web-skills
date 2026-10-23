import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';
import { ReadonlySdkVector, sdkVectorToArray } from '../utils/sdk-vector';
import { TEMPLATE_ATTACHMENT } from './template-authoring';

export interface TemplateTextSlot {
  replaceId: string;
  text: string | string[];
  fontFamily?: string;
  kind: 'caption' | 'compound-caption';
}

export function inspectTemplateTextSlots(
  context: NvsStreamingContext,
  templatePackage: AssetPackageRef,
): TemplateTextSlot[] {
  requireReadyAssetPackage(context, templatePackage, 'template package');
  const manager = context.getAssetPackageManager();
  const captions = sdkVectorToArray(
    manager.getTemplateCaptions(templatePackage.id) as unknown as ReadonlySdkVector<NvsTemplateCaptionDesc>,
  );
  const compounds = sdkVectorToArray(
    manager.getTemplateCompoundCaptions(templatePackage.id) as unknown as ReadonlySdkVector<NvsTemplateCompoundCaptionDesc>,
  );
  return [
    ...captions.map((caption) => ({
      replaceId: caption.replaceId,
      text: caption.text,
      fontFamily: caption.fontFamily,
      kind: 'caption' as const,
    })),
    ...compounds.map((caption) => ({
      replaceId: caption.replaceId,
      text: sdkVectorToArray(
        caption.itemList as unknown as ReadonlySdkVector<NvsTemplateCompoundCaptionItemDesc>,
      )
        .map((item) => item.text),
      kind: 'compound-caption' as const,
    })),
  ];
}

type PlainCaption = NvsTimelineCaption | NvsTrackCaption | NvsClipCaption;
type CompoundCaption = NvsTimelineCompoundCaption | NvsTrackCompoundCaption | NvsClipCompoundCaption;

function replacePlain(owner: {
  getFirstCaption(): PlainCaption;
  getNextCaption(caption: PlainCaption): PlainCaption;
}, replaceId: string, text: string): number {
  let count = 0;
  for (let caption = owner.getFirstCaption(); caption; caption = owner.getNextCaption(caption)) {
    if (caption.getTemplateAttachment(TEMPLATE_ATTACHMENT.replaceId) === replaceId) {
      caption.setText(text);
      count += 1;
    }
  }
  return count;
}

function replaceCompound(owner: {
  getFirstCompoundCaption(): CompoundCaption;
  getNextCompoundCaption(caption: CompoundCaption): CompoundCaption;
}, replaceId: string, texts: string[]): number {
  let count = 0;
  for (
    let caption = owner.getFirstCompoundCaption();
    caption;
    caption = owner.getNextCompoundCaption(caption)
  ) {
    if (caption.getTemplateAttachment(TEMPLATE_ATTACHMENT.replaceId) !== replaceId) continue;
    if (texts.length !== caption.getCaptionCount()) {
      throw new Error(`Compound caption ${replaceId} requires ${caption.getCaptionCount()} text items.`);
    }
    texts.forEach((text, index) => caption.setText(index, text));
    count += 1;
  }
  return count;
}

function replaceInTimeline(timeline: NvsTimeline, replaceId: string, value: string | string[]): number {
  let count = Array.isArray(value)
    ? replaceCompound(timeline, replaceId, value)
    : replacePlain(timeline, replaceId, value);
  for (let trackIndex = 0; trackIndex < timeline.videoTrackCount(); trackIndex += 1) {
    const track = timeline.getVideoTrackByIndex(trackIndex);
    count += Array.isArray(value)
      ? replaceCompound(track, replaceId, value)
      : replacePlain(track, replaceId, value);
    for (let clipIndex = 0; clipIndex < track.getClipCount(); clipIndex += 1) {
      const clip = track.getClipByIndex(clipIndex);
      count += Array.isArray(value)
        ? replaceCompound(clip, replaceId, value)
        : replacePlain(clip, replaceId, value);
      const nested = clip.getInternalTimeline();
      if (nested) count += replaceInTimeline(nested, replaceId, value);
    }
  }
  return count;
}

export async function replaceTemplateText(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  replaceId: string,
  value: string | string[],
): Promise<number> {
  if (!replaceId || (Array.isArray(value) ? value.length === 0 : value.length === 0)) {
    throw new Error('Template text replacement requires a replaceId and non-empty text.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const replaced = replaceInTimeline(timeline, replaceId, value);
  if (replaced === 0) throw new Error(`No caption with template replaceId ${replaceId} exists in the timeline.`);
  return replaced;
}
