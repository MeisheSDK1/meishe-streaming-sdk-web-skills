export async function replaceClipSource(
  context: NvsStreamingContext,
  clip: NvsVideoClip | NvsAudioClip,
  sdkReadablePath: string,
): Promise<void> {
  if (!sdkReadablePath) throw new Error('Provide the replacement SDK-readable media path.');
  if (!sdkReadablePath.startsWith(':/') && !FS.analyzePath(sdkReadablePath).exists) {
    throw new Error(`[missing-external] Provide the replacement media in SDK FS: ${sdkReadablePath}`);
  }
  await context.streamingEngineReadyForTimelineModification();
  if (!clip.changeClipFilePath(sdkReadablePath)) {
    throw new Error('The SDK could not replace the clip source; verify media type, duration, and stream compatibility.');
  }
}
