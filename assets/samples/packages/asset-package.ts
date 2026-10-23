import { fetchToSdkFs, removeFromSdkFs } from '../media/media-fs';
import { assetPackageRoot } from '../media/sdk-fs-paths';
import { SingleFlightQueue } from '../utils/single-flight-queue';

export interface AssetPackageRef {
  id: string;
  type: number;
}

export interface AssetPackageRequest {
  packageUrl: string;
  packageFileName: string;
  packageId: string;
  packageType: number;
  licenseUrl?: string;
  licenseFileName?: string;
  timeoutMs?: number;
}

export function requireReadyAssetPackage(
  context: NvsStreamingContext,
  asset: AssetPackageRef,
  label = 'asset package',
): void {
  if (!asset.id) throw new Error(`Provide the ${label} ID.`);
  if (context.getAssetPackageManager().getAssetPackageStatus(asset.id, asset.type) !== NvsAssetPackageStatusEnum.Ready) {
    throw new Error(`The ${label} must be installed and Ready.`);
  }
}

export class AssetPackageInstallCoordinator {
  private readonly queue = new SingleFlightQueue<string>();
  private disposed = false;
  private readonly context: NvsStreamingContext;

  constructor(context: NvsStreamingContext) {
    this.context = context;
  }

  install(request: AssetPackageRequest): Promise<string> {
    this.assertRequest(request);
    if (this.disposed) return Promise.reject(new Error('The asset-package coordinator is disposed.'));
    const key = `${request.packageType}:${request.packageId}`;
    return this.queue.run(key, () => this.installOne(request));
  }

  dispose(): void {
    this.disposed = true;
    this.queue.clear();
  }

  private assertRequest(request: AssetPackageRequest): void {
    if (!request.packageId || !request.packageFileName) throw new Error('Use the original package file name and its package ID.');
    if (/[\\/]/.test(request.packageFileName) || (request.licenseFileName && /[\\/]/.test(request.licenseFileName))) {
      throw new Error('Package and license file names must not contain directory separators.');
    }
    if (request.licenseUrl && !request.licenseFileName) throw new Error('Provide the original license file name with licenseUrl.');
    if ((request.timeoutMs ?? 30_000) <= 0) throw new Error('timeoutMs must be positive.');
  }

  private async installOne(request: AssetPackageRequest): Promise<string> {
    if (this.disposed) throw new Error('The asset-package coordinator is disposed.');
    const manager = this.context.getAssetPackageManager();
    const status = manager.getAssetPackageStatus(request.packageId, request.packageType);
    if (status === NvsAssetPackageStatusEnum.Ready) return request.packageId;
    if (status === NvsAssetPackageStatusEnum.Installing || status === NvsAssetPackageStatusEnum.Upgrading) {
      return this.waitForReady(request);
    }
    if (status !== NvsAssetPackageStatusEnum.NotInstalled) throw new Error(`Unknown asset package status ${status}; do not continue silently.`);

    const fsRoot = assetPackageRoot(request.packageType);
    const packagePath = await fetchToSdkFs(request.packageUrl, `/${fsRoot}/${request.packageFileName}`, [fsRoot]);
    let licensePath = '';
    try {
      if (request.licenseUrl && request.licenseFileName) {
        licensePath = await fetchToSdkFs(request.licenseUrl, `/${fsRoot}/${request.licenseFileName}`, [fsRoot]);
      }
      return await this.startInstall(request, packagePath, licensePath);
    } finally {
      removeFromSdkFs(packagePath, [fsRoot]);
      if (licensePath) removeFromSdkFs(licensePath, [fsRoot]);
    }
  }

  private waitForReady(request: AssetPackageRequest): Promise<string> {
    const manager = this.context.getAssetPackageManager();
    const timeoutMs = request.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (this.disposed) {
          clearInterval(timer);
          reject(new Error('The asset-package coordinator was disposed while waiting.'));
          return;
        }
        const status = manager.getAssetPackageStatus(request.packageId, request.packageType);
        if (status === NvsAssetPackageStatusEnum.Ready) {
          clearInterval(timer);
          resolve(request.packageId);
        } else if (status !== NvsAssetPackageStatusEnum.Installing && status !== NvsAssetPackageStatusEnum.Upgrading) {
          clearInterval(timer);
          reject(new Error(`Asset package left its active state before becoming Ready: ${status}.`));
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('Asset package installation timed out while waiting for Ready.'));
        }
      }, 100);
    });
  }

  private startInstall(request: AssetPackageRequest, packagePath: string, licensePath: string): Promise<string> {
    const manager = this.context.getAssetPackageManager();
    const timeoutMs = request.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const previous = manager.onFinishAssetPackageInstallation;
      let settled = false;
      let statusTimer = 0;
      let timeout = 0;
      const cleanup = () => {
        if (settled) return false;
        settled = true;
        clearInterval(statusTimer);
        clearTimeout(timeout);
        if (manager.onFinishAssetPackageInstallation === handler) manager.onFinishAssetPackageInstallation = previous;
        return true;
      };
      const finishReady = () => { if (cleanup()) resolve(request.packageId); };
      const fail = (error: Error) => { if (cleanup()) reject(error); };
      const handler = (id: string, filePath: string, type: number, error: number) => {
        try { previous?.(id, filePath, type, error); } catch (callbackError) { console.error('Previous asset-package callback failed:', callbackError); }
        if (id !== request.packageId || type !== request.packageType) return;
        if (error === NvsAssetPackageErrorEnum.NoError || error === NvsAssetPackageErrorEnum.AlreadyInstalledError) {
          if (manager.getAssetPackageStatus(id, type) === NvsAssetPackageStatusEnum.Ready) finishReady();
        } else fail(new Error(`Asset package installation failed with code ${error}.`));
      };
      manager.onFinishAssetPackageInstallation = handler;
      timeout = setTimeout(() => fail(new Error('Asset package installation timed out; inspect the SDK callback and package files.')), timeoutMs);
      statusTimer = setInterval(() => {
        if (this.disposed) fail(new Error('The asset-package coordinator was disposed during installation.'));
        else if (manager.getAssetPackageStatus(request.packageId, request.packageType) === NvsAssetPackageStatusEnum.Ready) finishReady();
      }, 100);
      let immediate: number;
      try { immediate = manager.installAssetPackage(packagePath, licensePath, request.packageType); }
      catch (error) { fail(error instanceof Error ? error : new Error(String(error))); return; }
      if (immediate === NvsAssetPackageErrorEnum.AlreadyInstalledError) {
        if (manager.getAssetPackageStatus(request.packageId, request.packageType) === NvsAssetPackageStatusEnum.Ready) finishReady();
        else fail(new Error('The SDK reported AlreadyInstalled but the requested package is not Ready.'));
      } else if (immediate !== NvsAssetPackageErrorEnum.NoError && immediate !== NvsAssetPackageErrorEnum.WorkingInProgress) {
        fail(new Error(`Asset package installation could not start: ${immediate}.`));
      }
    });
  }
}
