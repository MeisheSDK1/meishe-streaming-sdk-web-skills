export interface SdkRuntimeEnvironmentOptions {
  /** Project-verified default: 128. Must be set before loading the SDK/WASM. */
  maxImageReaderCount?: number;
  /** Project-verified default: 15 with WebCodecs VideoEncoder, otherwise 10. */
  maxVideoReaderCount?: number;
  /** Project-verified default: prefer WebCodecs hardware decoding. */
  preferHardwareDecoder?: boolean;
}

export interface AppliedSdkRuntimeEnvironment {
  maxImageReaderCount: number;
  maxVideoReaderCount: number;
  preferHardwareDecoder: boolean;
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
}

/** Call once before WASMLoader.loadEmscriptenModule(). These settings persist in this browser origin. */
export function configureSdkRuntimeEnvironment(
  options: SdkRuntimeEnvironmentOptions = {},
): AppliedSdkRuntimeEnvironment {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    throw new Error('Meishe SDK runtime settings require browser LocalStorage and cannot run during SSR.');
  }
  const maxImageReaderCount = options.maxImageReaderCount ?? 128;
  const maxVideoReaderCount = options.maxVideoReaderCount ??
    (typeof (globalThis as typeof globalThis & { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' ? 15 : 10);
  const preferHardwareDecoder = options.preferHardwareDecoder ?? true;
  requirePositiveInteger(maxImageReaderCount, 'maxImageReaderCount');
  requirePositiveInteger(maxVideoReaderCount, 'maxVideoReaderCount');
  if (typeof preferHardwareDecoder !== 'boolean') {
    throw new Error('preferHardwareDecoder must be a boolean.');
  }

  try {
    const values = {
      'meishesdk-max-image-reader-count': String(maxImageReaderCount),
      'meishesdk-max-video-reader-count': String(maxVideoReaderCount),
      'meishesdk-webcodecs-prefer-hardware-decoder': String(preferHardwareDecoder),
    };
    if (globalThis.Module?.Meishe?.streamingContext) {
      const mismatch = Object.entries(values).find(([key, value]) => localStorage.getItem(key) !== value);
      if (mismatch) {
        throw new Error(
          `${mismatch[0]} must be configured before SDK/WASM initialization; apply it and reload the page.`,
        );
      }
    } else {
      Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
    }
  } catch (error) {
    throw new Error(`Unable to persist Meishe SDK runtime settings: ${String(error)}`);
  }
  return { maxImageReaderCount, maxVideoReaderCount, preferHardwareDecoder };
}
