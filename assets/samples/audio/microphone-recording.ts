import { ensureSdkFsDirectory } from '../media/media-fs';
import { assertSdkFsFilePath } from '../media/sdk-fs-paths';

function interleaveStereo(left: Float32Array, right: Float32Array): Float32Array {
  if (left.length !== right.length) throw new Error('Microphone channel buffers have different lengths.');
  const output = new Float32Array(left.length * 2);
  for (let index = 0; index < left.length; index += 1) {
    output[index * 2] = left[index];
    output[index * 2 + 1] = right[index];
  }
  return output;
}

export interface SdkMicrophoneRecording {
  outputPath: string;
  stop(): Promise<Uint8Array>;
  cancel(): Promise<void>;
}

export async function startSdkMicrophoneRecording(
  outputPath: string,
  bufferSize: 1024 | 2048 | 4096 = 1024,
): Promise<SdkMicrophoneRecording> {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('[missing-external] Microphone capture requires a secure browser context and MediaDevices permission.');
  }
  assertSdkFsFilePath(outputPath, ['record']);
  if (FS.analyzePath(outputPath).exists) {
    throw new Error(`Refuse to overwrite an existing SDK FS file: ${outputPath}`);
  }
  ensureSdkFsDirectory(outputPath.slice(0, outputPath.lastIndexOf('/')), ['record']);

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 2 } });
  let audioContext: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: ScriptProcessorNode | undefined;
  let writer: NvsAudioFileWriter | undefined;
  try {
    audioContext = new AudioContext();
    await audioContext.resume();
    source = audioContext.createMediaStreamSource(stream);
    // ScriptProcessorNode is used because NvsAudioFileWriter consumes synchronous
    // Float32 PCM blocks. It must remain connected for onaudioprocess to fire.
    processor = audioContext.createScriptProcessor(bufferSize, 2, 2);
    writer = new NvsAudioFileWriter(audioContext.sampleRate, 2, outputPath);
    source.connect(processor);
    processor.connect(audioContext.destination);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    processor?.disconnect();
    writer?.close();
    if (audioContext && audioContext.state !== 'closed') await audioContext.close();
    if (FS.analyzePath(outputPath).exists) FS.unlink(outputPath);
    throw error;
  }
  if (!audioContext || !source || !processor || !writer) {
    throw new Error('Microphone capture initialization did not complete.');
  }
  let writeError: Error | undefined;
  let finished = false;

  processor.onaudioprocess = (event) => {
    if (finished || writeError) return;
    const input = event.inputBuffer;
    const left = input.getChannelData(0);
    const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
    if (!writer.writeAudioData(interleaveStereo(left, right) as unknown as AudioData)) {
      writeError = new Error('NvsAudioFileWriter rejected a microphone PCM block.');
    }
  };
  const closeCapture = async (): Promise<void> => {
    if (finished) return;
    finished = true;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    const closed = writer.close();
    await audioContext.close();
    if (!closed) throw new Error('NvsAudioFileWriter could not finalize the recording.');
    if (writeError) throw writeError;
  };

  return {
    outputPath,
    async stop() {
      await closeCapture();
      if (!FS.analyzePath(outputPath).exists) {
        throw new Error('The finalized recording is missing from SDK FS.');
      }
      return new Uint8Array(FS.readFile(outputPath));
    },
    async cancel() {
      try {
        await closeCapture();
      } finally {
        if (FS.analyzePath(outputPath).exists) FS.unlink(outputPath);
      }
    },
  };
}
