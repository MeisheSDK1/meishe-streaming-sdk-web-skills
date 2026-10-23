import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export interface SrtCue {
  text: string;
  inPointUs: number;
  outPointUs: number;
}

function parseTime(value: string): number {
  const match = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  const [, hours, minutes, seconds, milliseconds] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) throw new Error(`Invalid SRT timestamp: ${value}`);
  return (
    Number(hours) * 3_600_000_000 +
    Number(minutes) * 60_000_000 +
    Number(seconds) * 1_000_000 +
    Number(milliseconds) * 1_000
  );
}

export function parseSrt(content: string): SrtCue[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  return normalized.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
    const timing = lines.shift();
    const match = timing && /^(.*?)\s+-->\s+(.*?)(?:\s+.*)?$/.exec(timing);
    if (!match) throw new Error(`Invalid SRT timing line in block ${blockIndex + 1}.`);
    const inPointUs = parseTime(match[1]);
    const outPointUs = parseTime(match[2]);
    const text = lines.join('\n').trim();
    if (!text || outPointUs <= inPointUs) throw new Error(`Invalid SRT cue ${blockIndex + 1}.`);
    return { text, inPointUs, outPointUs };
  });
}

export async function addSrtCaptions(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  cues: SrtCue[],
  stylePackage?: AssetPackageRef,
  zValue = 100,
): Promise<NvsTimelineCaption[]> {
  if (stylePackage) requireReadyAssetPackage(context, stylePackage, 'caption style package');
  if (cues.some((cue) => cue.inPointUs < 0 || cue.outPointUs <= cue.inPointUs || cue.outPointUs > timeline.getDuration())) {
    throw new Error('Every SRT cue must fit inside the timeline. Extend the timeline before importing captions.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const added: NvsTimelineCaption[] = [];
  try {
    for (const cue of cues) {
      const caption = timeline.addCaption(
        cue.text,
        cue.inPointUs,
        cue.outPointUs - cue.inPointUs,
        stylePackage?.id ?? '',
        false,
      );
      if (!caption) throw new Error(`The SDK could not add SRT cue at ${cue.inPointUs}.`);
      caption.setZValue(zValue);
      added.push(caption);
    }
    return added;
  } catch (error) {
    added.reverse().forEach((caption) => timeline.removeCaption(caption));
    throw error;
  }
}
