export interface SeparateAlphaOptions {
  /** SDK-readable alpha video/playlist whose red or alpha channel drives opacity. */
  alphaFilePath: string;
  useAlphaChannel?: boolean;
  invertAlpha?: boolean;
  useClipTrim?: boolean;
}

export async function attachSeparateAlpha(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  options: SeparateAlphaOptions,
): Promise<{ effect: NvsVideoFx; remove(): Promise<void> }> {
  if (!options.alphaFilePath) throw new Error('Provide the matching alpha media path.');
  if (!options.alphaFilePath.startsWith(':/') && !FS.analyzePath(options.alphaFilePath).exists) {
    throw new Error(`[missing-external] Provide the alpha media in SDK FS: ${options.alphaFilePath}`);
  }
  await context.streamingEngineReadyForTimelineModification();
  const effect = clip.appendRawBuiltinFx('Set Alpha');
  if (!effect) throw new Error('The SDK could not append the raw-input Set Alpha effect.');
  try {
    effect.setStringVal('Alpha File', options.alphaFilePath);
    effect.setBooleanVal('Clip Trim Used', options.useClipTrim ?? true);
    effect.setBooleanVal('Use Alpha Channel', options.useAlphaChannel ?? false);
    effect.setBooleanVal('Invert Alpha', options.invertAlpha ?? false);
  } catch (error) {
    clip.removeRawFx(effect.getIndex());
    throw error;
  }
  return {
    effect,
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      if (!clip.removeRawFx(effect.getIndex())) throw new Error('The SDK could not remove Set Alpha.');
    },
  };
}
