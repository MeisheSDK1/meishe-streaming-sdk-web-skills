import {
  configureSdkRuntimeEnvironment,
  type AppliedSdkRuntimeEnvironment,
  type SdkRuntimeEnvironmentOptions,
} from './runtime-environment';
import { loadMeisheSdk, type MeisheLoaderOptions } from './sdk-loader';

export interface MeisheSdkStartupOptions {
  loader: MeisheLoaderOptions;
  runtimeEnvironment?: SdkRuntimeEnvironmentOptions;
}

export interface StartedMeisheSdk {
  context: NvsStreamingContext;
  runtimeEnvironment: AppliedSdkRuntimeEnvironment;
}

let startupPromise: Promise<StartedMeisheSdk> | undefined;

/** Call while entering the editor or loading an editing project, before reporting project readiness. */
export function startMeisheSdkForProjectLoad(
  options: MeisheSdkStartupOptions,
): Promise<StartedMeisheSdk> {
  if (startupPromise) return startupPromise;

  // Keep success and failure terminal for this page. Retrying a partial WASM/context
  // startup could call initInternalResources() twice; reload before a new attempt.
  startupPromise = Promise.resolve().then(async () => {
    const runtimeEnvironment = configureSdkRuntimeEnvironment(options.runtimeEnvironment);
    const context = await loadMeisheSdk(options.loader);
    return { context, runtimeEnvironment };
  });

  return startupPromise;
}

/** Interaction handlers may await this promise but must never start SDK loading. */
export function requireProjectLoadSdk(): Promise<StartedMeisheSdk> {
  if (!startupPromise) {
    throw new Error('Start Meishe SDK initialization during editor/project loading before reporting project readiness.');
  }
  return startupPromise;
}
