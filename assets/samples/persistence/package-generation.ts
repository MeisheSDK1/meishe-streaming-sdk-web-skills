import { assertSdkFsFilePath, assertSdkFsPath, type SdkFsRoot } from '../media/sdk-fs-paths';

let generationInProgress = false;

export interface PackageGenerationRequest {
  kind: 'template' | 'project';
  /** SDK FS directory containing info.json and all package-owned resources. */
  innerAssetDirectory: string;
  /** Customer-generated stable package ID; do not use a fixed sample UUID. */
  packageId: string;
  /** Existing SDK FS directory that will receive the generated package file. */
  outputDirectory: string;
  timeoutMs?: number;
}

export async function generatePackage(
  context: NvsStreamingContext,
  request: PackageGenerationRequest,
): Promise<{ outputPath: string; bytes: Uint8Array; remove(): void }> {
  if (generationInProgress) {
    throw new Error('Generate packages sequentially because the SDK exposes one generation callback slot.');
  }
  if (!request.packageId) throw new Error('Provide a customer-generated stable package ID.');
  const allowedRoots: readonly SdkFsRoot[] = request.kind === 'template'
    ? ['template', 'projectresource']
    : ['project', 'projectresource'];
  for (const [label, directory] of [
    ['inner asset', request.innerAssetDirectory],
    ['output', request.outputDirectory],
  ] as const) {
    assertSdkFsPath(directory, allowedRoots);
    if (!directory || !FS.analyzePath(directory).exists) {
      throw new Error(`[missing-external] Prepare the ${label} directory in SDK FS: ${directory}`);
    }
  }
  if (!FS.analyzePath(`${request.innerAssetDirectory}/info.json`).exists) {
    throw new Error('[missing-external] Write the customer-owned info.json before generating the package.');
  }
  const timeoutMs = request.timeoutMs ?? 60_000;
  if (timeoutMs <= 0) throw new Error('timeoutMs must be positive.');

  const manager = context.getAssetPackageManager();
  generationInProgress = true;
  return new Promise((resolve, reject) => {
    const previous = manager.onFinishTemplatePackageGenerate;
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (manager.onFinishTemplatePackageGenerate === handler) {
        manager.onFinishTemplatePackageGenerate = previous;
      }
      generationInProgress = false;
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Package generation timed out; inspect the shared generation callback.'));
    }, timeoutMs);
    // Register before starting generation; a fast callback must not be missed.
    const handler = (outputPath: string, error: number) => {
      try {
        previous?.(outputPath, error);
      } catch (callbackError) {
        console.error('Previous package-generation callback failed:', callbackError);
      }
      cleanup();
      if (error !== NvsAssetPackageErrorEnum.NoError) {
        reject(new Error(`Package generation failed with code ${error}.`));
        return;
      }
      if (!outputPath || !FS.analyzePath(outputPath).exists) {
        reject(new Error('The generation callback returned no readable SDK FS output.'));
        return;
      }
      let bytes: Uint8Array;
      try {
        assertSdkFsFilePath(outputPath, allowedRoots);
        bytes = FS.readFile(outputPath) as Uint8Array;
      } catch (readError) {
        reject(readError);
        return;
      }
      resolve({
        outputPath,
        bytes,
        remove() {
          if (FS.analyzePath(outputPath).exists) FS.unlink(outputPath);
        },
      });
    };
    manager.onFinishTemplatePackageGenerate = handler;
    let started: boolean;
    try {
      started = request.kind === 'template'
        ? manager.generateTemplatePackage(request.innerAssetDirectory, request.packageId, request.outputDirectory)
        : manager.generateProjectPackage(request.innerAssetDirectory, request.packageId, request.outputDirectory);
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }
    if (!started) {
      cleanup();
      reject(new Error(`The SDK could not start ${request.kind} package generation.`));
    }
  });
}
