import { removeFromSdkFs, writeBytesToSdkFs } from '../media/media-fs';

export const DEFAULT_CAPTION_FONT_URL =
  'https://alieasset.meishesdk.com/font/NotoSansCJKsc-Regular.otf';

const MAX_FONT_BYTES = 64 * 1024 * 1024;

export interface InstalledCaptionFont {
  family: string;
  sdkFsPath: string;
  applyTo(caption: NvsCaption): void;
  dispose(): void;
}

export interface CaptionFontInstallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

function supportedExtension(name: string): string {
  const match = name.match(/\.(otf|ttf|ttc)(?:$|[?#])/i);
  if (!match) throw new Error('Use an .otf, .ttf, or .ttc caption font.');
  return match[1].toLowerCase();
}

async function readFont(source: File | string, options: CaptionFontInstallOptions): Promise<{ bytes: Uint8Array; extension: string }> {
  const extension = supportedExtension(typeof source === 'string' ? source : source.name);
  let buffer: ArrayBuffer;
  if (typeof source === 'string') {
    if (options.signal?.aborted) {
      throw new Error('Caption font fetch was aborted before it started.', { cause: options.signal.reason });
    }
    const timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Caption font timeoutMs must be a positive finite number.');
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort('Caption font fetch timed out.'), timeoutMs);
    try {
      const response = await fetch(source, { mode: 'cors', signal: controller.signal });
      if (!response.ok) throw new Error(`Caption font fetch failed with HTTP ${response.status}.`);
      buffer = await response.arrayBuffer();
    } finally {
      globalThis.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  } else {
    buffer = await source.arrayBuffer();
  }
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FONT_BYTES) {
    throw new Error('Caption font must be non-empty and no larger than 64 MiB.');
  }
  return { bytes, extension };
}

export async function installCaptionFont(
  context: NvsStreamingContext,
  source: File | string,
  options: CaptionFontInstallOptions = {},
): Promise<InstalledCaptionFont> {
  const { bytes, extension } = await readFont(source, options);
  const sdkFsPath = `/font/caption-${crypto.randomUUID()}.${extension}`;
  writeBytesToSdkFs(sdkFsPath, bytes, ['font']);
  const family = context.registerFontByFilePath(sdkFsPath);
  if (!family) {
    removeFromSdkFs(sdkFsPath, ['font']);
    throw new Error('The SDK could not register the font file.');
  }
  return {
    family,
    sdkFsPath,
    applyTo(caption) {
      caption.setFontByFilePath(sdkFsPath);
    },
    dispose() {
      removeFromSdkFs(sdkFsPath, ['font']);
    },
  };
}
