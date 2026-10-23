export interface AudioContextResumeController {
  resume(): Promise<void>;
  dispose(): void;
}

export function resumeAudioContextOnUserGesture(
  onError: (error: unknown) => void = console.error,
): AudioContextResumeController {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    throw new Error('Install the audio resume handler in a browser after document.body exists.');
  }

  let disposed = false;
  let resuming: Promise<void> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    document.body.removeEventListener('mousedown', handleGesture);
    window.removeEventListener('keydown', handleGesture);
  };
  const resume = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error('Audio resume controller is disposed.'));
    if (!resuming) {
      resuming = nvsResumeAudioContextWithPromise()
        .then(dispose)
        .catch((error) => {
          resuming = undefined;
          throw error;
        });
    }
    return resuming;
  };
  function handleGesture(): void {
    void resume().catch(onError);
  }

  document.body.addEventListener('mousedown', handleGesture);
  window.addEventListener('keydown', handleGesture);
  return { resume, dispose };
}
