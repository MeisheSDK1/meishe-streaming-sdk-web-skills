export interface SdkVersionReport {
  staticApiHeaderVersion: string;
  runtimeVersion: string;
  matchesStaticApiHeader: boolean | null;
}

/** Call only after the WASM-backed streaming context is ready. */
export function readSdkVersionReport(
  context: NvsStreamingContext,
  staticApiHeaderVersion = 'unknown',
): SdkVersionReport {
  const runtime = context.getSdkVersion();
  const runtimeVersion = `${runtime.majorVersion}.${runtime.minorVersion}.${runtime.revisionNumber}`;
  return {
    staticApiHeaderVersion,
    runtimeVersion,
    matchesStaticApiHeader:
      staticApiHeaderVersion === 'unknown' ? null : staticApiHeaderVersion === runtimeVersion,
  };
}
