export interface CaptionFormatting {
  fontFamily?: string;
  fontSize?: number;
  weight?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  verticalLayout?: boolean;
  textAlignment?: number;
  verticalAlignment?: number;
  letterSpacing?: number;
  letterSpacingType?: number;
  lineSpacing?: number;
  textColor?: NvsColor;
  drawOutline?: boolean;
  outlineColor?: NvsColor;
  outlineWidth?: number;
  drawShadow?: boolean;
  shadowColor?: NvsColor;
  shadowOffset?: NvsPointF;
  shadowFeather?: number;
  backgroundColor?: NvsColor;
  /** Alpha in the inclusive 0..1 range. Zero disables the background. */
  backgroundOpacity?: number;
  backgroundRadius?: number;
}

export function readCaptionFormatting(caption: NvsCaption): CaptionFormatting {
  return {
    fontFamily: caption.getFontFamily(),
    fontSize: caption.getFontSize(),
    weight: caption.getWeight(),
    bold: caption.getBold(),
    italic: caption.getItalic(),
    underline: caption.getUnderline(),
    verticalLayout: caption.getVerticalLayout(),
    textAlignment: caption.getTextAlignment(),
    verticalAlignment: caption.getTextVerticalAlignment(),
    letterSpacing: caption.getLetterSpacing(),
    letterSpacingType: caption.getLetterSpacingType(),
    lineSpacing: caption.getLineSpacing(),
    textColor: caption.getTextColor(),
    drawOutline: caption.getDrawOutline(),
    outlineColor: caption.getOutlineColor(),
    outlineWidth: caption.getOutlineWidth(),
    drawShadow: caption.getDrawShadow(),
    shadowColor: caption.getShadowColor(),
    shadowOffset: caption.getShadowOffset(),
    shadowFeather: caption.getShadowFeather(),
    backgroundColor: caption.getBackgroundColor(),
    backgroundRadius: caption.getBackgroundRadius(),
  };
}

export async function formatCaption(
  context: NvsStreamingContext,
  caption: NvsCaption,
  value: CaptionFormatting,
): Promise<void> {
  if ((value.fontSize ?? 1) <= 0 || (value.outlineWidth ?? 0) < 0) {
    throw new Error('Caption font size must be positive and outline width cannot be negative.');
  }
  if ((value.shadowFeather ?? 0) < 0 || (value.backgroundRadius ?? 0) < 0) {
    throw new Error('Caption shadow feather and background radius cannot be negative.');
  }
  if ((value.backgroundOpacity ?? 0) < 0 || (value.backgroundOpacity ?? 0) > 1) {
    throw new Error('Caption background opacity must be between 0 and 1.');
  }
  await context.streamingEngineReadyForTimelineModification();
  if (value.fontFamily !== undefined) caption.setFontFamily(value.fontFamily);
  if (value.fontSize !== undefined) caption.setFontSize(value.fontSize);
  if (value.weight !== undefined) caption.setWeight(value.weight);
  if (value.bold !== undefined) caption.setBold(value.bold);
  if (value.italic !== undefined) caption.setItalic(value.italic);
  if (value.underline !== undefined) caption.setUnderline(value.underline);
  if (value.verticalLayout !== undefined) caption.setVerticalLayout(value.verticalLayout);
  if (value.textAlignment !== undefined) caption.setTextAlignment(value.textAlignment);
  if (value.verticalAlignment !== undefined) caption.setTextVerticalAlignment(value.verticalAlignment);
  if (value.letterSpacingType !== undefined) caption.setLetterSpacingType(value.letterSpacingType);
  if (value.letterSpacing !== undefined) caption.setLetterSpacing(value.letterSpacing);
  if (value.lineSpacing !== undefined) caption.setLineSpacing(value.lineSpacing);
  if (value.textColor !== undefined) caption.setTextColor(value.textColor);
  if (value.drawOutline !== undefined) caption.setDrawOutline(value.drawOutline);
  if (value.outlineColor !== undefined) caption.setOutlineColor(value.outlineColor);
  if (value.outlineWidth !== undefined) caption.setOutlineWidth(value.outlineWidth);
  if (value.drawShadow !== undefined) caption.setDrawShadow(value.drawShadow);
  if (value.shadowColor !== undefined) caption.setShadowColor(value.shadowColor);
  if (value.shadowOffset !== undefined) caption.setShadowOffset(value.shadowOffset);
  if (value.shadowFeather !== undefined) caption.setShadowFeather(value.shadowFeather);
  if (value.backgroundColor !== undefined || value.backgroundOpacity !== undefined) {
    const color = value.backgroundColor ?? caption.getBackgroundColor();
    caption.setBackgroundColor(new NvsColor(color.r, color.g, color.b, value.backgroundOpacity ?? color.a));
  }
  if (value.backgroundRadius !== undefined) caption.setBackgroundRadius(value.backgroundRadius);
}

export async function setTimelineCaptionSpeedEnabled(
  context: NvsStreamingContext,
  caption: NvsTimelineCaption,
  enabled: boolean,
): Promise<void> {
  const originalOutPoint = caption.getOutPoint();
  await context.streamingEngineReadyForTimelineModification();
  // In SDK 3.16.0 the duration change is what makes enableSpeed take effect.
  caption.changeOutPoint(caption.getInPoint() + 5_000_000);
  caption.enableSpeed(enabled);
  caption.changeOutPoint(originalOutPoint);
  caption.setBooleanVal('Stretch Time', enabled);
}
