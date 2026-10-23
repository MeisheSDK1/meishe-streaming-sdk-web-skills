function requireLut(path: string): void {
  if (!path || !FS.analyzePath(path).exists) {
    throw new Error(`[missing-external] Provide the .mslut or PNG LUT in SDK FS: ${path || '(missing path)'}`);
  }
}

export async function addClipLut(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  lutPath: string,
  intensity = 1,
): Promise<NvsVideoFx> {
  requireLut(lutPath);
  if (intensity < 0 || intensity > 4) throw new Error('Lut intensity must be in the documented [0, 4] range.');
  await context.streamingEngineReadyForTimelineModification();
  const effect = clip.appendRawBuiltinFx('Lut');
  if (!effect) throw new Error('The SDK could not add the built-in Lut effect.');
  effect.setStringVal('Data File Path', lutPath);
  effect.setFloatVal('Intensity', intensity);
  return effect;
}

export async function addTimelineLut(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  lutPath: string,
  inPointUs = 0,
  durationUs = timeline.getDuration(),
  intensity = 1,
): Promise<NvsTimelineVideoFx> {
  requireLut(lutPath);
  if (inPointUs < 0 || durationUs <= 0 || inPointUs + durationUs > timeline.getDuration()) {
    throw new Error('Timeline Lut range must fit inside the timeline.');
  }
  if (intensity < 0 || intensity > 4) throw new Error('Lut intensity must be in the documented [0, 4] range.');
  await context.streamingEngineReadyForTimelineModification();
  const effect = timeline.addBuiltinTimelineVideoFx(inPointUs, durationUs, 'Lut');
  if (!effect) throw new Error('The SDK could not add the timeline Lut effect.');
  effect.setStringVal('Data File Path', lutPath);
  effect.setFloatVal('Intensity', intensity);
  return effect;
}
