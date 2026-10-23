export interface AppliedAutoTone {
  info: NvsAIToningInfo;
  effects: NvsVideoFx[];
  remove(): Promise<void>;
}

let imageGrabInProgress = false;
let faceDetectionInProgress = false;

export function grabTimelineFrame(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  timestampUs: number,
  timeoutMs = 15_000,
): Promise<ImageData> {
  if (imageGrabInProgress) throw new Error('The SDK image-grab callback is already owned by another request.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  if (timestampUs < 0 || timestampUs >= timeline.getDuration()) {
    throw new Error('Image-grab time must be inside the timeline.');
  }
  imageGrabInProgress = true;
  return new Promise((resolve, reject) => {
    const previous = context.onImageGrabbedArrived;
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      context.onImageGrabbedArrived = previous;
      imageGrabInProgress = false;
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeline image grab timed out.'));
    }, timeoutMs);
    context.onImageGrabbedArrived = (imageData, time, sourceTimeline) => {
      try {
        previous?.(imageData, time, sourceTimeline);
      } catch (callbackError) {
        console.error('Previous image-grab callback failed:', callbackError);
      }
      if (sourceTimeline !== timeline || time !== timestampUs) return;
      cleanup();
      resolve(imageData as ImageData);
    };
    let result: boolean;
    try {
      result = context.grabImageFromTimeline(timeline, timestampUs, new NvsRational(1, 1), 0);
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }
    if (!result) {
      cleanup();
      reject(new Error('The SDK could not start timeline image grabbing.'));
    }
  });
}

export async function applyAutoToneToClip(
  context: NvsStreamingContext,
  clip: NvsVideoClip,
  image: ImageData,
): Promise<AppliedAutoTone> {
  if (!image || image.width <= 0 || image.height <= 0) throw new Error('Provide a non-empty ImageData frame.');
  const info = context.getAutoToneParametersNew(image, image.width, image.height, false);
  if (!info) throw new Error('The SDK could not calculate automatic tone parameters.');
  await context.streamingEngineReadyForTimelineModification();
  const basic = clip.appendRawBuiltinFx('BasicImageAdjust');
  const tint = clip.appendRawBuiltinFx('Tint');
  const sharpen = clip.appendRawBuiltinFx('Sharpen');
  const definition = clip.appendRawBuiltinFx('Definition');
  const effects = [basic, tint, sharpen, definition];
  if (effects.some((effect) => !effect)) {
    effects.filter(Boolean).reverse().forEach((effect) => clip.removeRawFx(effect.getIndex()));
    throw new Error('The SDK could not create the automatic tone effect stack.');
  }
  basic.setFloatVal('Exposure', info.exposure);
  basic.setFloatVal('Highlight', info.highlight);
  basic.setFloatVal('Shadow', info.shadow);
  basic.setFloatVal('Brightness', info.brightness);
  basic.setFloatVal('Contrast', info.contrast);
  basic.setFloatVal('Blackpoint', info.blackpoint);
  basic.setFloatVal('Saturation', info.saturation);
  basic.setFloatVal('Vibrance', info.vibrance);
  tint.setFloatVal('Temperature', info.warmth);
  tint.setFloatVal('Tint', info.tint);
  sharpen.setFloatVal('Amount', info.sharpeness);
  definition.setFloatVal('Intensity', info.definition);
  let activeEffects = [...effects];
  return {
    info,
    effects,
    async remove() {
      if (activeEffects.length === 0) return;
      await context.streamingEngineReadyForTimelineModification();
      const failedIndexes: number[] = [];
      for (const effect of [...activeEffects].reverse()) {
        if (clip.removeRawFx(effect.getIndex())) {
          activeEffects = activeEffects.filter((candidate) => candidate !== effect);
        } else {
          failedIndexes.push(effect.getIndex());
        }
      }
      if (failedIndexes.length > 0) {
        throw new Error(`The SDK could not remove automatic tone Raw FX: ${failedIndexes.join(', ')}.`);
      }
    },
  };
}

interface MutableLandmarks {
  size(): number;
  get(index: number): number;
  set(index: number, value: number): void;
}

export function convertFaceInfoNdcToImagePixels(
  faceInfo: NvsFaceInfo,
  width: number,
  height: number,
): NvsFaceInfo {
  if (!faceInfo || width <= 0 || height <= 0) throw new Error('Face conversion needs face data and image dimensions.');
  const toPixel = (x: number, y: number): [number, number] => [
    x * (width / 2) + width / 2,
    height / 2 - y * (height / 2),
  ];
  faceInfo.rect.left = toPixel(faceInfo.rect.left, 0)[0];
  faceInfo.rect.right = toPixel(faceInfo.rect.right, 0)[0];
  faceInfo.rect.top = toPixel(0, faceInfo.rect.top)[1];
  faceInfo.rect.bottom = toPixel(0, faceInfo.rect.bottom)[1];
  const landmarks = faceInfo.landmarks as MutableLandmarks;
  for (let index = 0; index + 1 < landmarks.size(); index += 2) {
    const [x, y] = toPixel(landmarks.get(index), landmarks.get(index + 1));
    landmarks.set(index, x);
    landmarks.set(index + 1, y);
  }
  return faceInfo;
}

export function calculatePortraitAutoTone(
  context: NvsStreamingContext,
  image: ImageData,
  faceInfoInImagePixels: NvsFaceInfo,
): NvsAIToningInfo {
  if (!image || image.width <= 0 || image.height <= 0 || !faceInfoInImagePixels) {
    throw new Error('[missing-external] Portrait auto tone needs a frame and detected face landmarks.');
  }
  const info = context.getAutoToneParametersWithFaceInfo(
    image,
    image.width,
    image.height,
    faceInfoInImagePixels,
  );
  if (!info) throw new Error('The SDK could not calculate portrait automatic tone parameters.');
  return info;
}

interface FaceVector {
  size(): number;
  get(index: number): NvsFaceInfo;
}

export async function detectTimelineFace(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  timestampUs: number,
  timeoutMs = 15_000,
): Promise<NvsFaceInfo | null> {
  if (faceDetectionInProgress) throw new Error('The SDK face-detection callback is already owned by another request.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  if (timestampUs < 0 || timestampUs >= timeline.getDuration()) {
    throw new Error('Face-detection time must be inside the timeline.');
  }
  await context.streamingEngineReadyForTimelineModification();
  const effect = timeline.addBuiltinTimelineVideoFx(0, timeline.getDuration(), 'AR Scene');
  if (!effect) throw new Error('The SDK could not create the temporary AR Scene detector.');
  effect.setBooleanVal('Force Detect', true);
  const manipulate = effect.getARSceneManipulate();
  if (!manipulate) {
    timeline.removeTimelineVideoFx(effect);
    throw new Error('[missing-external] Initialize matching human-detection models before portrait auto tone.');
  }
  manipulate.setDetectionMode(
    NvsHumanDetectionFeatureEnum.ImageMode | NvsHumanDetectionFeatureEnum.MultiThread,
  );

  faceDetectionInProgress = true;
  return new Promise((resolve, reject) => {
    const previous = context.onNotifyFaceDetectionData;
    let settled = false;
    const cleanup = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      context.onNotifyFaceDetectionData = previous;
      try {
        await context.streamingEngineReadyForTimelineModification();
        timeline.removeTimelineVideoFx(effect);
      } finally {
        faceDetectionInProgress = false;
      }
    };
    const rejectAfterCleanup = (error: unknown) => {
      void cleanup().then(
        () => reject(error),
        (cleanupError) => reject(new AggregateError(
          [error, cleanupError],
          'Face detection failed and its temporary SDK resources could not be removed.',
        )),
      );
    };
    const timeout = setTimeout(() => {
      rejectAfterCleanup(new Error('Face detection timed out.'));
    }, timeoutMs);
    context.onNotifyFaceDetectionData = (value) => {
      try {
        previous?.(value);
      } catch (callbackError) {
        console.error('Previous face-detection callback failed:', callbackError);
      }
      const faces = value as FaceVector;
      const face = faces && faces.size() > 0 ? faces.get(0) : null;
      void cleanup().then(() => resolve(face), reject);
    };
    try {
      if (!context.setARSceneInstanceToDetectFaceDatas(manipulate.contextInterface)) {
        rejectAfterCleanup(new Error('The SDK rejected the AR Scene detection instance.'));
        return;
      }
      if (!context.seekTimeline(timeline, timestampUs, NvsVideoPreviewSizeModeEnum.LiveWindowSize, 0)) {
        rejectAfterCleanup(new Error('The SDK could not seek to trigger face detection.'));
      }
    } catch (error) {
      rejectAfterCleanup(error);
    }
  });
}
