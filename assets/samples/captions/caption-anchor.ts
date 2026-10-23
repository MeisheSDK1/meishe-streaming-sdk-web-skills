import { compensateAnchorChange } from '../utils/anchor-compensation';

interface CaptionVector {
  size(): number;
  get(index: number): NvsPointF;
}

type CaptionWithBounds = NvsCaption | NvsCompoundCaption;

function getCaptionCenter(caption: CaptionWithBounds): NvsPointF {
  const compound = caption as NvsCompoundCaption;
  const plain = caption as NvsCaption;
  const vertices = (
    typeof compound.getCompoundBoundingVertices === 'function'
      ? compound.getCompoundBoundingVertices(
          NvsCaptionTextBoundingTypeEnum.Frame,
          undefined as unknown as NvsMotionParameters,
        )
      : plain.getBoundingRectangleVertices()
  ) as unknown as CaptionVector;
  if (vertices.size() < 4) throw new Error('The SDK did not return a caption bounding rectangle.');
  let left = vertices.get(0).x;
  let right = left;
  let top = vertices.get(0).y;
  let bottom = top;
  for (let index = 1; index < vertices.size(); index += 1) {
    const point = vertices.get(index);
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.max(top, point.y);
    bottom = Math.min(bottom, point.y);
  }
  return new NvsPointF((left + right) / 2, (top + bottom) / 2);
}

export async function moveCaptionAnchorToVisualCenter(
  context: NvsStreamingContext,
  caption: CaptionWithBounds,
): Promise<NvsPointF> {
  await context.streamingEngineReadyForTimelineModification();
  const translation = caption.getCaptionTranslation();
  const oldAnchor = caption.getAnchorPoint();
  const scaleX = caption.getScaleX();
  const scaleY = caption.getScaleY();
  const rotation = caption.getRotationZ();
  const plainCaption = caption as NvsCaption;
  const canControlUserOperation = typeof plainCaption.setRecordingUserOperation === 'function';

  if (canControlUserOperation) plainCaption.setRecordingUserOperation(false);
  try {
    caption.setCaptionTranslation(new NvsPointF(0, 0));
    caption.setScaleX(1);
    caption.setScaleY(1);
    caption.setRotationZ(0);
    caption.setAnchorPoint(new NvsPointF(0, 0));
    const newAnchor = getCaptionCenter(caption);
    const [translationX, translationY] = compensateAnchorChange(
      rotation,
      [scaleX, scaleY],
      [translation.x, translation.y],
      [oldAnchor.x, oldAnchor.y],
      [newAnchor.x, newAnchor.y],
    );
    caption.setCaptionTranslation(new NvsPointF(translationX, translationY));
    caption.setAnchorPoint(newAnchor);
    caption.setScaleX(scaleX);
    caption.setScaleY(scaleY);
    caption.setRotationZ(rotation);
    return newAnchor;
  } catch (error) {
    caption.setAnchorPoint(oldAnchor);
    caption.setScaleX(scaleX);
    caption.setScaleY(scaleY);
    caption.setRotationZ(rotation);
    caption.setCaptionTranslation(translation);
    throw error;
  } finally {
    if (canControlUserOperation) plainCaption.setRecordingUserOperation(true);
  }
}
