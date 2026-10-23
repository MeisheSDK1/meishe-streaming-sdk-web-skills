import { compensateAnchorChange } from '../utils/anchor-compensation';
import { getMediaDisplaySize } from '../utils/media-display-size';

export interface ViewCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getCropBox(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  clip: NvsVideoClip,
  crop: NvsVideoFx,
): CropBox {
  const left = crop.getFloatVal('Bounding Left');
  const top = crop.getFloatVal('Bounding Top');
  const right = crop.getFloatVal('Bounding Right');
  const bottom = crop.getFloatVal('Bounding Bottom');
  const media = getMediaDisplaySize(context, clip.getFilePath());
  const resolution = timeline.getVideoRes();
  const timelineWidth = Number(resolution.imageWidth);
  const timelineHeight = Number(resolution.imageHeight);
  if (timelineWidth <= 0 || timelineHeight <= 0) {
    throw new Error('The timeline video resolution is invalid.');
  }

  const fitScale = Math.min(timelineWidth / media.width, timelineHeight / media.height);
  const fittedWidth = media.width * fitScale;
  const fittedHeight = media.height * fitScale;
  return {
    width: ((right - left) * fittedWidth) / 2,
    height: ((top - bottom) * fittedHeight) / 2,
    x: (fittedWidth / 2) * ((right + left) / 2),
    y: (fittedHeight / 2) * ((bottom + top) / 2),
  };
}

function movePropertyAnchorToCropCenter(property: NvsVideoFx, cropBox: CropBox): void {
  const translation: [number, number] = [
    property.getFloatVal('Trans X'),
    property.getFloatVal('Trans Y'),
  ];
  const scale: [number, number] = [
    property.getFloatVal('Scale X'),
    property.getFloatVal('Scale Y'),
  ];
  const oldAnchor: [number, number] = [
    property.getFloatVal('Anchor X'),
    property.getFloatVal('Anchor Y'),
  ];
  const newAnchor: [number, number] = [cropBox.x, cropBox.y];
  const rotation = property.getFloatVal('Rotation');
  const [translationX, translationY] = compensateAnchorChange(
    rotation,
    scale,
    translation,
    oldAnchor,
    newAnchor,
  );
  try {
    property.setFloatVal('Anchor X', newAnchor[0]);
    property.setFloatVal('Anchor Y', newAnchor[1]);
    property.setFloatVal('Trans X', translationX);
    property.setFloatVal('Trans Y', translationY);
  } catch (error) {
    property.setFloatVal('Anchor X', oldAnchor[0]);
    property.setFloatVal('Anchor Y', oldAnchor[1]);
    property.setFloatVal('Trans X', translation[0]);
    property.setFloatVal('Trans Y', translation[1]);
    throw error;
  }
}

function firstRegionalRawFxIndex(clip: NvsVideoClip): number {
  for (let index = 0; index < clip.getRawFxCount(); index += 1) {
    if (clip.getRawFxByIndex(index).getRegional()) return index;
  }
  return clip.getRawFxCount();
}

export async function addNdcCrop(
  context: NvsStreamingContext,
  timeline: NvsTimeline,
  liveWindow: NvsLiveWindow,
  clip: NvsVideoClip,
  viewRect: ViewCropRect,
  /** Defaults to immediately before the first regional Raw FX. */
  insertBeforeRawFxIndex = firstRegionalRawFxIndex(clip),
): Promise<{ effect: NvsVideoFx; cropBox: CropBox }> {
  const values = [viewRect.x, viewRect.y, viewRect.width, viewRect.height];
  if (!values.every(Number.isFinite) || viewRect.width <= 0 || viewRect.height <= 0) {
    throw new Error('Crop rectangle values must be finite and its size must be positive.');
  }
  const rawFxCount = clip.getRawFxCount();
  if (
    !Number.isInteger(insertBeforeRawFxIndex) ||
    insertBeforeRawFxIndex < 0 ||
    insertBeforeRawFxIndex > rawFxCount
  ) {
    throw new Error('Crop insertion index must be in [0, getRawFxCount()].');
  }

  await context.streamingEngineReadyForTimelineModification();
  clip.enablePropertyVideoFx(true);
  const property = clip.getPropertyVideoFx();
  if (!property) throw new Error('The SDK could not enable the clip property effect.');

  const oldRawMode = clip.getRawFilterProcessesMode();
  // This recipe follows useCrop.ts's explicit NvsRawFilterProcessesMode.None path.
  // Other processing modes need their own verified Force Center/fill-mode policy.
  clip.setRawFilterProcessesMode(NvsRawFilterProcessesMode.None);
  const topLeft = liveWindow.mapViewToNormalized(new NvsPointF(viewRect.x, viewRect.y));
  const bottomRight = liveWindow.mapViewToNormalized(
    new NvsPointF(viewRect.x + viewRect.width, viewRect.y + viewRect.height),
  );
  const crop = insertBeforeRawFxIndex === rawFxCount
    ? clip.appendRawBuiltinFx('Crop')
    : clip.insertRawBuiltinFx('Crop', insertBeforeRawFxIndex);
  if (!crop) {
    clip.setRawFilterProcessesMode(oldRawMode);
    throw new Error('The SDK could not add the built-in Crop effect.');
  }

  try {
    crop.setMenuVal('Coordinate System Type', 'NDC');
    crop.setFloatVal('Bounding Left', topLeft.x);
    crop.setFloatVal('Bounding Top', topLeft.y);
    crop.setFloatVal('Bounding Right', bottomRight.x);
    crop.setFloatVal('Bounding Bottom', bottomRight.y);
    const cropBox = getCropBox(context, timeline, clip, crop);
    movePropertyAnchorToCropCenter(property, cropBox);
    return { effect: crop, cropBox };
  } catch (error) {
    clip.removeRawFx(crop.getIndex());
    clip.setRawFilterProcessesMode(oldRawMode);
    throw error;
  }
}
