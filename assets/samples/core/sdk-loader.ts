import { WASMLoader } from 'meishewasmloader';
import { initializeSdkFsRoots } from '../media/sdk-fs-paths';

export type MeisheAuthorization =
  | {
      mode: 'required';
      /** Customer-provided project URL. Do not log or persist it in task output. */
      licenseUrl: string;
      /** Failed retries after the initial request. Mirrors the production editor. */
      maxRetries?: number;
    }
  | {
      mode: 'skip';
      /** Must be true only after the customer accepts watermark/capability impact. */
      customerConfirmedImpact: true;
    };

export interface MeisheLoaderOptions {
  /** Public root populated from one verified customer delivery, normally /wasm/. */
  sdkRoot: string;
  /** Defaults to `${sdkRoot}/NvStreamingSdk.js`. */
  sdkApiUrl?: string;
  authorization: MeisheAuthorization;
  /** Set true only when an already-loaded context has completed initInternalResources(). */
  internalResourcesAlreadyInitialized?: boolean;
  enableDropFrameMode?: boolean;
  enableMultithreadDecoding?: boolean;
  onStatus?: (status: string) => void;
  timeoutMs?: number;
}

declare interface MeisheLoader {
  loadEmscriptenModule(
    sdkRoot: string,
    options?: {
      enableDropFrameMode?: boolean;
      enableMultithreadDecoding?: boolean;
    },
  ): void;
}

let loaderActive = false;
let loaderTerminalFailed = false;
let loaderTerminalCause: unknown;

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  if (!trimmed) throw new Error('Provide the installed customer SDK root, normally /wasm/.');
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function assertRuntimeEnvironment(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Meishe Streaming SDK must be loaded in a browser, not during SSR.');
  }
  if (!globalThis.crossOriginIsolated || typeof globalThis.SharedArrayBuffer === 'undefined') {
    throw new Error('Meishe SDK requires COOP/COEP cross-origin isolation and SharedArrayBuffer.');
  }
}

function sdkApiReady(): boolean {
  return typeof globalThis.nvsGetStreamingContextInstance === 'function';
}

async function ensureSdkApiScript(url: string, timeoutMs: number): Promise<void> {
  if (sdkApiReady()) return;
  const absoluteUrl = new URL(url, document.baseURI).href;
  let script = Array.from(document.scripts).find((item) => item.src === absoluteUrl);
  let created = false;
  if (!script) {
    script = document.createElement('script');
    script.src = absoluteUrl;
    script.async = false;
    created = true;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (operation: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        script!.removeEventListener('load', loaded);
        script!.removeEventListener('error', failed);
        operation();
      };
      const loaded = () => finish(resolve);
      const failed = () => finish(() => reject(new Error(`Failed to load customer SDK API: ${url}`)));
      const timeout = setTimeout(
        () => finish(() => reject(new Error('Meishe SDK API loading timed out.'))),
        timeoutMs,
      );
      script!.addEventListener('load', loaded, { once: true });
      script!.addEventListener('error', failed, { once: true });
      if (created) document.head.append(script!);
    });
    if (!sdkApiReady()) {
      throw new Error('NvStreamingSdk.js loaded, but nvsGetStreamingContextInstance is unavailable.');
    }
  } catch (error) {
    if (created) script.remove();
    throw error;
  }
}

export async function waitForStreamingContext(timeoutMs = 30_000): Promise<void> {
  if (timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  const deadline = Date.now() + timeoutMs;
  while (!globalThis.Module?.Meishe?.streamingContext) {
    if (Date.now() >= deadline) {
      throw new Error('Meishe SDK loaded, but Module.Meishe.streamingContext did not become ready.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

async function requestAuthorization(
  context: NvsStreamingContext,
  licenseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const previous = context.onWebRequestAuthFinish;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (context.onWebRequestAuthFinish === handler) context.onWebRequestAuthFinish = previous;
      operation();
    };
    const handler = (success: boolean, uuid: unknown) => {
      try {
        previous?.(success, uuid);
      } catch (error) {
        console.error('Previous authorization callback failed:', error);
      }
      finish(() => resolve(success));
    };
    const timeout = setTimeout(
      () => finish(() => reject(new Error('Meishe SDK authorization timed out.'))),
      timeoutMs,
    );
    context.onWebRequestAuthFinish = handler;
    if (!context.verifySdkLicenseFile(licenseUrl)) {
      finish(() => reject(new Error('Meishe SDK authorization request could not start.')));
    }
  });
}

async function authorize(
  context: NvsStreamingContext,
  authorization: MeisheAuthorization,
  timeoutMs: number,
  onStatus?: (status: string) => void,
): Promise<void> {
  if (authorization.mode === 'skip') {
    if (authorization.customerConfirmedImpact !== true) {
      throw new Error('Skipping authorization requires explicit customer impact acknowledgement.');
    }
    onStatus?.('authorization-skipped-by-customer');
    return;
  }

  const licenseUrl = authorization.licenseUrl.trim();
  if (!licenseUrl) throw new Error('Required SDK authorization needs the customer authentication URL.');
  const maxRetries = authorization.maxRetries ?? 3;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) {
    throw new Error('maxRetries must be an integer from 0 to 3.');
  }
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    onStatus?.(attempt === 0 ? 'authorizing' : `authorization-retry-${attempt}`);
    try {
      if (await requestAuthorization(context, licenseUrl, timeoutMs)) return;
      lastError = new Error('Meishe SDK authorization callback reported failure.');
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('Meishe SDK authorization failed after the configured retries.', { cause: lastError });
}

export async function loadMeisheSdk(options: MeisheLoaderOptions): Promise<NvsStreamingContext> {
  assertRuntimeEnvironment();
  if (loaderTerminalFailed) {
    throw new Error('A previous Meishe SDK runtime attempt failed; reload the page before retrying.', {
      cause: loaderTerminalCause,
    });
  }
  if (loaderActive) throw new Error('SDK loading and authorization must run sequentially.');
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  const sdkRoot = normalizeRoot(options.sdkRoot);
  loaderActive = true;
  let runtimeAttemptStarted = Boolean(globalThis.Module?.Meishe?.streamingContext);

  try {
    const alreadyLoaded = Boolean(globalThis.Module?.Meishe?.streamingContext);
    if (!alreadyLoaded) {
      await ensureSdkApiScript(options.sdkApiUrl ?? `${sdkRoot}NvStreamingSdk.js`, timeoutMs);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (operation: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          operation();
        };
        const timeout = setTimeout(
          () => finish(() => reject(new Error('Meishe SDK/WASM loading timed out.'))),
          timeoutMs,
        );
        const loader = WASMLoader({
          showLoader(state: string) {
            options.onStatus?.(state);
          },
          showError(error: unknown) {
            finish(() => reject(new Error(`Meishe SDK load failed: ${String(error)}`)));
          },
          loadingFinished() {
            finish(resolve);
          },
        }) as MeisheLoader;
        try {
          runtimeAttemptStarted = true;
          loader.loadEmscriptenModule(sdkRoot, {
            enableDropFrameMode: options.enableDropFrameMode ?? true,
            enableMultithreadDecoding: options.enableMultithreadDecoding ?? false,
          });
        } catch (error) {
          finish(() => reject(error));
        }
      });
      await waitForStreamingContext(timeoutMs);
    }

    const context = nvsGetStreamingContextInstance();
    initializeSdkFsRoots();
    if (!alreadyLoaded || options.internalResourcesAlreadyInitialized !== true) {
      context.initInternalResources();
    }
    await authorize(context, options.authorization, timeoutMs, options.onStatus);
    return context;
  } catch (error) {
    if (runtimeAttemptStarted) {
      loaderTerminalFailed = true;
      loaderTerminalCause = error;
    }
    throw error;
  } finally {
    loaderActive = false;
  }
}
