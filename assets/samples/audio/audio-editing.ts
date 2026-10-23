export type AudioChannelMode = 'stereo' | 'left' | 'right';

export interface AudioClipOptions {
  filePath: string;
  inPointUs: number;
  outPointUs: number;
  trimInUs: number;
  trimOutUs: number;
  speed?: number;
  keepAudioPitch?: boolean;
  volume?: number;
  channelMode?: AudioChannelMode;
  fadeInUs?: number;
  fadeOutUs?: number;
  streamIndex?: number;
}

export async function addConfiguredAudioClip(
  context: NvsStreamingContext,
  track: NvsAudioTrack,
  options: AudioClipOptions,
): Promise<NvsAudioClip> {
  if (!options.filePath) throw new Error('Provide an SDK-readable audio path.');
  if (options.inPointUs < 0 || options.outPointUs <= options.inPointUs) {
    throw new Error('Audio timeline out-point must be greater than its in-point.');
  }
  if (options.trimInUs < 0 || options.trimOutUs <= options.trimInUs) {
    throw new Error('Audio source trim-out must be greater than trim-in.');
  }
  if ((options.speed ?? 1) <= 0 || (options.volume ?? 1) < 0) {
    throw new Error('Audio speed must be positive and volume cannot be negative.');
  }
  if ((options.fadeInUs ?? 0) < 0 || (options.fadeOutUs ?? 0) < 0) {
    throw new Error('Audio fade durations cannot be negative.');
  }
  if (options.streamIndex !== undefined && (!Number.isInteger(options.streamIndex) || options.streamIndex < 0)) {
    throw new Error('Audio stream index must be a non-negative integer.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const clip = track.addClipWithSpeedExt2(
    options.filePath,
    options.inPointUs,
    options.outPointUs,
    options.trimInUs,
    options.trimOutUs,
    options.speed ?? 1,
    options.keepAudioPitch ?? true,
  );
  if (!clip) throw new Error('The SDK could not add the audio clip.');

  const volume = options.volume ?? 1;
  const channelMode = options.channelMode ?? 'stereo';
  clip.setVolumeGain(
    channelMode === 'right' ? 0 : volume,
    channelMode === 'left' ? 0 : volume,
  );
  clip.setFadeInDuration(options.fadeInUs ?? 0);
  clip.setFadeOutDuration(options.fadeOutUs ?? 0);
  if (options.streamIndex !== undefined) clip.setAudioStreamIndex(options.streamIndex);
  return clip;
}

export function addBuiltinAudioEffect(
  clip: NvsAudioClip,
  effectName: string,
  configure?: (effect: NvsAudioFx) => void,
): NvsAudioFx {
  if (!effectName) throw new Error('Provide a documented built-in audio effect name.');
  const effect = clip.appendFx(effectName);
  if (!effect) throw new Error(`The SDK could not append audio effect ${effectName}.`);
  try {
    configure?.(effect);
  } catch (error) {
    clip.removeFx(effect.getIndex());
    throw error;
  }
  return effect;
}

export function addLoudnessNormalization(
  clip: NvsAudioClip | NvsVideoClip,
  integratedLoudnessLufs = -23,
): NvsAudioFx {
  if (!Number.isFinite(integratedLoudnessLufs) || integratedLoudnessLufs < -70 || integratedLoudnessLufs > -5) {
    throw new Error('Integrated loudness must be within [-70, -5] LUFS.');
  }
  const effect = clip instanceof NvsAudioClip
    ? clip.appendFx('Audio LoudNorm')
    : clip.appendAudioFx('Audio LoudNorm');
  if (!effect) throw new Error('The SDK could not add Audio LoudNorm.');
  effect.setFloatVal('Integrated Loudness', integratedLoudnessLufs);
  return effect;
}

export function setTrackVolume(
  track: NvsVideoTrack | NvsAudioTrack,
  volume: number,
  channelMode: AudioChannelMode = 'stereo',
): void {
  if (!Number.isFinite(volume) || volume < 0) throw new Error('Track volume must be non-negative.');
  if (!track.setVolumeGain(
    channelMode === 'right' ? 0 : volume,
    channelMode === 'left' ? 0 : volume,
  )) {
    throw new Error('The SDK could not set the track volume.');
  }
}

export async function setAudioFadeTransition(
  context: NvsStreamingContext,
  track: NvsAudioTrack,
  sourceClipIndex: number,
  enabled = true,
): Promise<NvsAudioTransition> {
  if (!Number.isInteger(sourceClipIndex) || sourceClipIndex < 0 || sourceClipIndex >= track.getClipCount() - 1) {
    throw new Error('An audio transition source index must identify a clip followed by another clip.');
  }
  await context.streamingEngineReadyForTimelineModification();
  // SDK 3.16.0 currently supports only the built-in Fade audio transition.
  return track.setBuiltinTransition(sourceClipIndex, enabled ? 'Fade' : '');
}

export function addBuiltinVideoClipAudioEffect(
  clip: NvsVideoClip,
  effectName: string,
  configure?: (effect: NvsAudioFx) => void,
): NvsAudioFx {
  if (!effectName) throw new Error('Provide a documented built-in audio effect name.');
  const effect = clip.appendAudioFx(effectName);
  if (!effect) throw new Error(`The SDK could not append video-clip audio effect ${effectName}.`);
  try {
    configure?.(effect);
  } catch (error) {
    clip.removeAudioFx(effect.getIndex());
    throw error;
  }
  return effect;
}

export interface AudioVolumeKeyframe {
  /** Clip-local time in microseconds. */
  localTimeUs: number;
  leftGain: number;
  rightGain: number;
}

export function setAudioVolumeKeyframes(
  clip: NvsAudioClip | NvsVideoClip,
  keyframes: AudioVolumeKeyframe[],
): NvsAudioFx {
  const durationUs = clip.getOutPoint() - clip.getInPoint();
  const volume = clip.getAudioVolumeFx();
  if (!volume) throw new Error('The SDK did not expose the clip audio-volume effect.');
  for (const keyframe of [...keyframes].sort((left, right) => left.localTimeUs - right.localTimeUs)) {
    if (
      keyframe.localTimeUs < 0 ||
      keyframe.localTimeUs >= durationUs ||
      keyframe.leftGain < 0 ||
      keyframe.rightGain < 0
    ) {
      throw new Error('Audio-volume keyframes require clip-local times and non-negative gains.');
    }
    volume.setFloatValAtTime('Left Gain', keyframe.leftGain, keyframe.localTimeUs);
    volume.setFloatValAtTime('Right Gain', keyframe.rightGain, keyframe.localTimeUs);
  }
  return volume;
}
