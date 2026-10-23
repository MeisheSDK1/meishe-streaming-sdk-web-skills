export interface LiveWindowCanvasSize {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  pixelRatio: number;
}

function alignedBackingSize(value: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(Math.round(value) / multiple) * multiple);
}

export function setLiveWindowCanvasSize(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  pixelRatio = window.devicePixelRatio || 1,
): LiveWindowCanvasSize {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0 || !Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error('LiveWindow CSS size and pixel ratio must be positive.');
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = alignedBackingSize(cssWidth * pixelRatio, 4);
  canvas.height = alignedBackingSize(cssHeight * pixelRatio, 2);
  return {
    cssWidth,
    cssHeight,
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    pixelRatio,
  };
}

export function syncLiveWindowBackingStore(
  canvas: HTMLCanvasElement,
  pixelRatio = window.devicePixelRatio || 1,
): LiveWindowCanvasSize {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error('The laid-out LiveWindow canvas and pixel ratio must be positive.');
  }
  canvas.width = alignedBackingSize(bounds.width * pixelRatio, 4);
  canvas.height = alignedBackingSize(bounds.height * pixelRatio, 2);
  return {
    cssWidth: bounds.width,
    cssHeight: bounds.height,
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    pixelRatio,
  };
}
