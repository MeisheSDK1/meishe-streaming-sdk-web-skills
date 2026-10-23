export interface WatermarkHandle {
  setOpacity(opacity: number): void;
  remove(): Promise<void>;
}

function validateOpacity(opacity: number): void {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('Watermark opacity must be in [0, 1].');
  }
}

function requireWatermarkPath(path: string, label: string): void {
  if (!path) throw new Error(`Provide the ${label}.`);
  if (!path.startsWith(':/') && !FS.analyzePath(path).exists) {
    throw new Error(`[missing-external] Provide the ${label} in SDK FS: ${path}`);
  }
}

export async function addPositionedWatermark(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  filePath: string,
  displayWidth: number,
  displayHeight: number,
  opacity: number,
  position: number,
  marginX: number,
  marginY: number,
): Promise<WatermarkHandle> {
  if (displayWidth <= 0 || displayHeight <= 0 || marginX < 0 || marginY < 0) {
    throw new Error('Provide a watermark path, positive display size, and non-negative margins.');
  }
  requireWatermarkPath(filePath, 'watermark image');
  validateOpacity(opacity);
  await context.streamingEngineReadyForTimelineModification();
  timeline.addWatermark(filePath, displayWidth, displayHeight, opacity, position, marginX, marginY);
  return {
    setOpacity(value) {
      validateOpacity(value);
      if (!timeline.setWatermarkOpacity(value)) throw new Error('The SDK rejected watermark opacity.');
    },
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      timeline.deleteWatermark();
    },
  };
}

export async function addCanonicalWatermark(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  input: {
    sceneWidth: number;
    sceneHeight: number;
    imageName: string;
    imageWidth: number;
    imageHeight: number;
    translationX: number;
    translationY: number;
    directoryPath: string;
    opacity: number;
  },
): Promise<WatermarkHandle> {
  if (!input.imageName || !input.directoryPath || input.sceneWidth <= 0 || input.sceneHeight <= 0 || input.imageWidth <= 0 || input.imageHeight <= 0) {
    throw new Error('Canonical watermark scene, image, and directory values are required.');
  }
  requireWatermarkPath(input.directoryPath, 'watermark image directory');
  validateOpacity(input.opacity);
  await context.streamingEngineReadyForTimelineModification();
  timeline.addWatermark2(
    input.sceneWidth,
    input.sceneHeight,
    input.imageName,
    input.imageWidth,
    input.imageHeight,
    input.translationX,
    input.translationY,
    input.directoryPath,
    input.opacity,
  );
  return {
    setOpacity(value) {
      validateOpacity(value);
      if (!timeline.setWatermarkOpacity(value)) throw new Error('The SDK rejected watermark opacity.');
    },
    async remove() {
      await context.streamingEngineReadyForTimelineModification();
      timeline.deleteWatermark();
    },
  };
}
