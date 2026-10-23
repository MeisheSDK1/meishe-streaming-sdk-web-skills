import { AssetPackageRef, requireReadyAssetPackage } from '../packages/asset-package';

export type CaptionSpanKind =
  | 'fontSizeRatio'
  | 'opacity'
  | 'bodyOpacity'
  | 'outlineOpacity'
  | 'outlineWidth'
  | 'outlineColor'
  | 'fontFamily'
  | 'shadowOpacity'
  | 'normalText'
  | 'weight'
  | 'underline'
  | 'italic'
  | 'color'
  | 'rendererId'
  | 'backgroundDesc';

type UnitFloatCaptionSpanKind = 'opacity' | 'bodyOpacity' | 'outlineOpacity' | 'shadowOpacity';
type PositiveFloatCaptionSpanKind = 'fontSizeRatio';
type NonNegativeFloatCaptionSpanKind = 'outlineWidth' | 'normalText';
type BooleanCaptionSpanKind = 'underline' | 'italic';
type ColorCaptionSpanKind = 'outlineColor' | 'color';
type StringCaptionSpanKind = 'fontFamily' | 'backgroundDesc';

interface CaptionSpanRange {
  start: number;
  end: number;
}

export type CaptionSpanInput = CaptionSpanRange & (
  | { type: UnitFloatCaptionSpanKind; value: number }
  | { type: PositiveFloatCaptionSpanKind; value: number }
  | { type: NonNegativeFloatCaptionSpanKind; value: number }
  | { type: 'weight'; value: number }
  | { type: BooleanCaptionSpanKind; value: boolean }
  | { type: ColorCaptionSpanKind; value: NvsColor }
  | { type: StringCaptionSpanKind; value: string }
  | { type: 'rendererId'; value: AssetPackageRef }
);

interface MutableNvsVector extends NvsVectorVal {
  push_back(value: NvsCaptionSpan): void;
}

export function setCaptionSpans(
  context: NvsStreamingContext,
  caption: NvsCaption,
  text: string,
  inputs: CaptionSpanInput[],
): void {
  const vector = new NvsVectorVal() as MutableNvsVector;
  for (const input of inputs) {
    if (input.start < 0 || input.end <= input.start || input.end > text.length) {
      throw new Error(`Caption span [${input.start}, ${input.end}) is outside the text.`);
    }
    if (['opacity', 'bodyOpacity', 'outlineOpacity', 'shadowOpacity'].includes(input.type)) {
      const value = input.value as number;
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${input.type} caption span value must be in [0, 1].`);
      }
    } else if (input.type === 'fontSizeRatio' && (!Number.isFinite(input.value) || input.value <= 0)) {
      throw new Error('fontSizeRatio caption span value must be positive.');
    } else if (
      (input.type === 'outlineWidth' || input.type === 'normalText') &&
      (!Number.isFinite(input.value) || input.value < 0)
    ) {
      throw new Error(`${input.type} caption span value must be non-negative.`);
    } else if (
      input.type === 'weight' &&
      (!Number.isInteger(input.value) || input.value < 100 || input.value > 900)
    ) {
      throw new Error('weight caption span value must be an integer in [100, 900].');
    } else if ((input.type === 'fontFamily' || input.type === 'backgroundDesc') && !input.value.trim()) {
      throw new Error(`${input.type} caption span value must be non-empty.`);
    }

    let value: NvsCaptionSpan['value'];
    if (input.type === 'rendererId') {
      if (input.value.type !== NvsAssetPackageTypeEnum.CaptionRenderer) {
        throw new Error('rendererId caption spans require a CaptionRenderer package.');
      }
      requireReadyAssetPackage(context, input.value, 'rich-text caption renderer package');
      value = input.value.id;
    } else {
      value = input.value;
    }
    vector.push_back({
      type: input.type,
      start: input.start,
      end: input.end,
      value,
    });
  }
  caption.setText(text);
  caption.setTextSpanList(vector);
}
