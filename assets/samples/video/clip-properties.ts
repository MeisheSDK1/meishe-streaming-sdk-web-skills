export interface VideoClipProperties {
  extraRotation?: number;
  blendingMode?: number;
  fadeInUs?: number;
  fadeOutUs?: number;
  audioDisabled?: boolean;
  freezeFrameTrimPositionUs?: number | null;
  pan?: number;
  scan?: number;
}

export async function setVideoClipProperties(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  properties: VideoClipProperties,
): Promise<void> {
  if ((properties.fadeInUs ?? 0) < 0 || (properties.fadeOutUs ?? 0) < 0) {
    throw new Error('Fade durations must be non-negative microseconds.');
  }
  const freezePosition = properties.freezeFrameTrimPositionUs;
  if (
    freezePosition !== undefined &&
    freezePosition !== null &&
    (freezePosition < clip.getTrimIn() || freezePosition >= clip.getTrimOut())
  ) {
    throw new Error('Freeze-frame position must be inside the source trim range.');
  }

  await context.streamingEngineReadyForTimelineModification();
  if (properties.extraRotation !== undefined) {
    clip.setExtraVideoRotation(properties.extraRotation);
  }
  if (properties.blendingMode !== undefined) clip.setBlendingMode(properties.blendingMode);
  if (properties.fadeInUs !== undefined) clip.setFadeInDuration(properties.fadeInUs);
  if (properties.fadeOutUs !== undefined) clip.setFadeOutDuration(properties.fadeOutUs);
  if (properties.audioDisabled !== undefined) clip.disableAudioStreams(properties.audioDisabled);
  if (properties.pan !== undefined || properties.scan !== undefined) {
    clip.setPanAndScan(properties.pan ?? 0, properties.scan ?? 0);
  }
  if (freezePosition === null) {
    clip.enableClipFreezeFrame(false);
  } else if (freezePosition !== undefined) {
    clip.enableClipFreezeFrame(true);
    clip.setClipFreezeFrameTrimPosition(freezePosition);
  }
}
