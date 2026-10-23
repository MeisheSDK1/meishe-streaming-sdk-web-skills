import { sdkColorFromArgbHex } from '../utils/sdk-color';

export interface FloatAdjustmentParameter {
  type: 'float';
  defaultValue: number;
  min: number;
  max: number;
}

export interface ColorAdjustmentParameter {
  type: 'color';
  defaultValue: string;
}

export type AdjustmentParameter = FloatAdjustmentParameter | ColorAdjustmentParameter;

export const ADJUSTMENT_SCHEMA = {
  Tint: {
    Temperature: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Tint: { type: 'float', defaultValue: 0, min: -1, max: 1 },
  },
  BasicImageAdjust: {
    Saturation: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Vibrance: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Exposure: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Brightness: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Contrast: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Highlight: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Shadow: { type: 'float', defaultValue: 0, min: -1, max: 1 },
    Blackpoint: { type: 'float', defaultValue: 0, min: -1, max: 1 },
  },
  Sharpen: {
    Amount: { type: 'float', defaultValue: 0, min: 0, max: 5 },
  },
  Definition: {
    Intensity: { type: 'float', defaultValue: 0, min: 0, max: 1 },
  },
  Denoise: {
    Intensity: { type: 'float', defaultValue: 0, min: 0, max: 1 },
  },
  Vignette: {
    Degree: { type: 'float', defaultValue: 0, min: 0, max: 1 },
    Color: { type: 'color', defaultValue: '#ff000000' },
  },
} as const;

export type AdjustmentFxName = keyof typeof ADJUSTMENT_SCHEMA;
export type AdjustmentValues = Record<string, number | string | undefined>;

export const ADJUSTMENT_FX_NAMES: AdjustmentFxName[] = [
  'Tint',
  'BasicImageAdjust',
  'Sharpen',
  'Definition',
  'Denoise',
  'Vignette',
];

function getParameter(fxName: AdjustmentFxName, parameterName: string): AdjustmentParameter {
  const parameters = ADJUSTMENT_SCHEMA[fxName] as Record<string, AdjustmentParameter>;
  const parameter = parameters[parameterName];
  if (!parameter) throw new Error(`Unknown ${fxName} adjustment parameter: ${parameterName}`);
  return parameter;
}

export function setAdjustmentValues(
  fx: NvsVideoFx | NvsTimelineVideoFx,
  fxName: AdjustmentFxName,
  values: AdjustmentValues,
): void {
  for (const [parameterName, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const parameter = getParameter(fxName, parameterName);
    if (parameter.type === 'float') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fxName}.${parameterName} must be a finite number.`);
      }
      if (value < parameter.min || value > parameter.max) {
        throw new Error(`${fxName}.${parameterName} must be in [${parameter.min}, ${parameter.max}].`);
      }
      fx.setFloatVal(parameterName, value);
    } else {
      if (typeof value !== 'string') throw new Error(`${fxName}.${parameterName} must be #AARRGGBB.`);
      fx.setColorVal(parameterName, sdkColorFromArgbHex(value));
    }
  }
}

export function resetAdjustmentFx(
  fx: NvsVideoFx | NvsTimelineVideoFx,
  fxName: AdjustmentFxName,
): void {
  const parameters = ADJUSTMENT_SCHEMA[fxName] as Record<string, AdjustmentParameter>;
  for (const [parameterName, parameter] of Object.entries(parameters)) {
    if (parameter.type === 'float') fx.setFloatVal(parameterName, parameter.defaultValue);
    else fx.setColorVal(parameterName, sdkColorFromArgbHex(parameter.defaultValue));
  }
}
