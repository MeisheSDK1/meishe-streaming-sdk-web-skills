export interface LyricsCaptionOptions {
  text: string;
  inPointUs: number;
  durationUs: number;
  stylePackageId?: string;
}

/**
 * Creates a basic lyrics caption owned by the Timeline.
 * A lyrics lane in the editor is application metadata, not an SDK video track.
 */
export async function addLyricsCaption(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  options: LyricsCaptionOptions,
): Promise<{ caption: NvsTimelineCaption; remove(): Promise<void> }> {
  if (!options.text.trim() || options.inPointUs < 0 || options.durationUs <= 0) {
    throw new Error('Lyrics text, a non-negative in-point, and a positive duration are required.');
  }
  if (options.inPointUs >= timeline.getDuration()) {
    throw new Error('Lyrics in-point must be inside a non-empty timeline.');
  }

  await context.streamingEngineReadyForTimelineModification();
  const caption = timeline.addCaption(
    options.text,
    options.inPointUs,
    options.durationUs,
    options.stylePackageId ?? '',
    false,
  );
  if (!caption) throw new Error('The SDK could not add the lyrics caption.');

  caption.setIsLyrics(true);
  if (!caption.isLyrics()) {
    timeline.removeCaption(caption);
    throw new Error('The SDK did not retain the lyrics flag.');
  }

  return {
    caption,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      timeline.removeCaption(caption);
    },
  };
}
