import { createSdkVector } from '../utils/sdk-vector';
import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface TimeFollowWordInput {
  /** Text inside the full caption. Character offsets use JavaScript UTF-16 indexes. */
  text: string;
  start: number;
  end: number;
  /** Highlight timing relative to the caption in-point, in microseconds. */
  trimInUs: number;
  trimOutUs: number;
}

export interface TimeFollowCaptionOptions {
  text: string;
  inPointUs: number;
  durationUs: number;
  /** Extracted time-follow style directory in SDK FS, not an asset-package ID. */
  styleDirectoryPath: string;
  words: TimeFollowWordInput[];
  isLyrics?: boolean;
  zValue?: number;
  modularRendererPackage?: AssetPackageRef;
}

function validateWords(text: string, durationUs: number, words: TimeFollowWordInput[]): void {
  if (words.length === 0) throw new Error('Provide at least one timed caption word.');
  let previousEnd = 0;
  let previousTrimOutUs = 0;
  for (const word of words) {
    if (!word.text || !Number.isInteger(word.start) || !Number.isInteger(word.end)) {
      throw new Error('Each timed word requires text and integer character offsets.');
    }
    if (word.start < previousEnd || word.end <= word.start || word.end > text.length) {
      throw new Error('Timed-word character ranges must be ordered, non-overlapping, and inside the caption text.');
    }
    if (text.slice(word.start, word.end) !== word.text) {
      throw new Error(`Timed-word text does not match caption text at [${word.start}, ${word.end}).`);
    }
    if (
      word.trimInUs < previousTrimOutUs ||
      word.trimOutUs <= word.trimInUs ||
      word.trimOutUs > durationUs
    ) {
      throw new Error('Timed-word highlight ranges must be ordered, positive, and caption-local.');
    }
    previousEnd = word.end;
    previousTrimOutUs = word.trimOutUs;
  }
}

export function distributeTimeFollowWords(text: string, durationUs: number): TimeFollowWordInput[] {
  if (!text.trim() || durationUs <= 0) throw new Error('Provide non-empty text and a positive duration.');
  const segments = [...new Intl.Segmenter(['zh', 'ja-JP', 'en'], { granularity: 'word' }).segment(text)]
    .filter((segment) => segment.segment.trim());
  if (segments.length === 0) {
    return [{ text, start: 0, end: text.length, trimInUs: 0, trimOutUs: durationUs }];
  }
  const totalCharacters = segments.reduce((sum, segment) => sum + segment.segment.length, 0);
  let trimInUs = 0;
  return segments.map((segment, index) => {
    const trimOutUs = index === segments.length - 1
      ? durationUs
      : trimInUs + Math.floor(durationUs * (segment.segment.length / totalCharacters));
    const word = {
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
      trimInUs,
      trimOutUs,
    };
    trimInUs = trimOutUs;
    return word;
  });
}

export function createTimeFollowCaptionInfo(
  text: string,
  durationUs: number,
  words: TimeFollowWordInput[],
): NvsTimeFollowCaptionInfo {
  validateWords(text, durationUs, words);
  const sdkWords = words.map((input) => {
    const word = new NvsTimeFollowCaptionWord();
    word.text = input.text;
    word.start = input.start;
    word.end = input.end;
    word.trimIn = input.trimInUs;
    word.trimOut = input.trimOutUs;
    return word;
  });
  const info = new NvsTimeFollowCaptionInfo();
  info.text = text;
  info.words = createSdkVector(sdkWords);
  return info;
}

export async function addTimeFollowCaption(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  options: TimeFollowCaptionOptions,
): Promise<{ caption: NvsTimeFollowCaption; updateWords(words: TimeFollowWordInput[]): Promise<void>; remove(): Promise<void> }> {
  if (!options.text.trim() || options.inPointUs < 0 || options.durationUs <= 0) {
    throw new Error('Time-follow caption text, non-negative in-point, and positive duration are required.');
  }
  if (options.inPointUs >= timeline.getDuration()) {
    throw new Error('Time-follow caption in-point must be inside a non-empty timeline.');
  }
  if (!options.styleDirectoryPath || !FS.analyzePath(options.styleDirectoryPath).exists) {
    throw new Error(`[missing-external] Provide the extracted time-follow style directory in SDK FS: ${options.styleDirectoryPath}`);
  }
  if (options.modularRendererPackage) {
    if (options.modularRendererPackage.type !== NvsAssetPackageTypeEnum.CaptionRenderer) {
      throw new Error('Time-follow modularRendererPackage must be a CaptionRenderer package.');
    }
    requireReadyAssetPackage(context, options.modularRendererPackage, 'caption renderer package');
  }
  const info = createTimeFollowCaptionInfo(options.text, options.durationUs, options.words);
  await context.streamingEngineReadyForTimelineModification();
  const caption = timeline.addTimeFollowCaption(
    info,
    options.inPointUs,
    options.durationUs,
    options.styleDirectoryPath,
  );
  if (!caption) throw new Error('The SDK could not add the time-follow caption.');
  try {
    caption.setIsLyrics(options.isLyrics ?? false);
    if (options.zValue !== undefined) caption.setZValue(options.zValue);
    if (
      options.modularRendererPackage &&
      !caption.applyModularCaptionRenderer(options.modularRendererPackage.id)
    ) {
      throw new Error('The SDK could not apply the modular caption renderer.');
    }
    if (options.isLyrics) {
      const resolution = timeline.getVideoRes();
      if (!caption.resetTimelineSize(resolution.imageWidth, resolution.imageHeight)) {
        throw new Error('The SDK could not initialize the lyrics background for this timeline size.');
      }
    }
  } catch (error) {
    timeline.removeTimeFollowCaption(caption);
    throw error;
  }

  return {
    caption,
    async updateWords(words) {
      const next = createTimeFollowCaptionInfo(options.text, options.durationUs, words);
      await context.streamingEngineReadyForTimelineModification();
      if (!caption.setTimeFollowCaptionInfo(next, timeline)) {
        throw new Error('The SDK could not update the time-follow caption words.');
      }
    },
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      if (!timeline.removeTimeFollowCaption(caption)) {
        throw new Error('The SDK could not remove the time-follow caption.');
      }
    },
  };
}
