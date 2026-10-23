export interface PreviewResizeController {
  dispose(): void;
  resizeNow(): void;
}

export function observeResizableEditorPreview(
  viewport: HTMLElement,
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  aspectRatio: number,
  renderAtCurrentPosition: () => void,
): PreviewResizeController {
  if (!(aspectRatio > 0)) throw new Error('aspectRatio must be positive.');
  let frame = 0;
  const resizeNow = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const style = getComputedStyle(viewport);
      const availableWidth = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const width = Math.max(1, Math.min(availableWidth, availableHeight * aspectRatio));
      const height = width / aspectRatio;
      stage.style.width = `${Math.floor(width)}px`;
      stage.style.height = `${Math.floor(height)}px`;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(4, Math.ceil(Math.round(width * ratio) / 4) * 4);
      canvas.height = Math.max(2, Math.ceil(Math.round(height * ratio) / 2) * 2);
      renderAtCurrentPosition();
    });
  };
  const observer = new ResizeObserver(resizeNow);
  observer.observe(viewport);
  resizeNow();
  return { resizeNow, dispose: () => { observer.disconnect(); cancelAnimationFrame(frame); } };
}

export function formatTimelineTimecode(position: number, frameRate: number): string {
  if (!(frameRate > 0)) throw new Error('frameRate must be positive.');
  const totalFrames = Math.max(0, Math.floor(position * frameRate / 1_000_000));
  const frames = totalFrames % Math.round(frameRate);
  const totalSeconds = Math.floor(totalFrames / frameRate);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, '0')).join(':');
}
