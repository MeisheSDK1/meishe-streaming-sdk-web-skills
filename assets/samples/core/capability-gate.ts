export const WEB_EDITING_CAPABILITIES = {
  videoFx: NvsStreamingSdkFuncVideoFx,
  animatedSticker: NvsStreamingSdkFuncAnimatedSticker,
  music: NvsStreamingSdkFuncMusic,
  caption: NvsStreamingSdkFuncCaption,
  videoFxExtension: NvsStreamingSdkFuncVideoFxExtension,
  videoTransition: NvsStreamingSdkFuncVideoTransition,
  theme: NvsStreamingSdkFuncTheme,
  particleVideoFx: NvsStreamingSdkFuncParticleVideoFx,
  template: NvsStreamingSdkFuncTemplate,
  useTemplate: NvsStreamingSdkFuncUseTemplate,
  videoTransitionExtension: NvsStreamingSdkFuncVideoTransitionExtension,
  changeSpeed: NvsStreamingSdkFuncChangeSpeed,
  clipSplit: NvsStreamingSdkFuncClipSplit,
  videoColorAdjust: NvsStreamingSdkFuncVideoColorAdjust,
  captionStyleSetting: NvsStreamingSdkFuncCaptionStyleSetting,
} as const;

export type WebEditingCapability = keyof typeof WEB_EDITING_CAPABILITIES;

export type RuntimeCapabilityState =
  | { state: 'available'; capability: WebEditingCapability }
  | { state: 'missing-external'; capability: WebEditingCapability; reason: string }
  | { state: 'unknown'; capability: WebEditingCapability; reason: string };

export function inspectAuthorizedCapability(
  context: NvsStreamingContext,
  capability: WebEditingCapability,
): RuntimeCapabilityState {
  const runtime = context as NvsStreamingContext & {
    functionalityAuthorised?: (sdkFunctionName: string) => boolean;
  };
  if (typeof runtime.functionalityAuthorised !== 'function') {
    return {
      state: 'unknown',
      capability,
      reason: 'The target SDK does not expose functionalityAuthorised(); verify its version and license contract.',
    };
  }
  return runtime.functionalityAuthorised(WEB_EDITING_CAPABILITIES[capability])
    ? { state: 'available', capability }
    : {
        state: 'missing-external',
        capability,
        reason: `The current SDK authorization does not enable ${capability}.`,
      };
}

export function requireAuthorizedCapabilities(
  context: NvsStreamingContext,
  capabilities: readonly WebEditingCapability[],
): void {
  const blocked = capabilities
    .map((capability) => inspectAuthorizedCapability(context, capability))
    .filter((result) => result.state !== 'available');
  if (blocked.length > 0) {
    const detail = blocked.map((result) => `${result.capability}: ${result.reason}`).join('; ');
    throw new Error(`[${blocked.some((result) => result.state === 'unknown') ? 'unknown' : 'missing-external'}] ${detail}`);
  }
}
