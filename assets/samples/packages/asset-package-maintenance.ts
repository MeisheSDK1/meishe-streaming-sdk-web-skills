import { fetchToSdkFs, removeFromSdkFs } from '../media/media-fs';
import { assetPackageRoot } from '../media/sdk-fs-paths';
import type { AssetPackageRef } from './asset-package';

let upgradeInProgress = false;

export interface AssetPackageUpgradeRequest extends AssetPackageRef {
  packageUrl: string;
  packageFileName: string;
  licenseUrl?: string;
  licenseFileName?: string;
  expectedVersion?: number;
  timeoutMs?: number;
}

export function inspectAssetPackage(
  context: NvsStreamingContext,
  asset: AssetPackageRef,
): { status: number; version: number; contentType: string } {
  if (!asset.id) throw new Error('Provide the asset-package ID.');
  const manager = context.getAssetPackageManager();
  return {
    status: manager.getAssetPackageStatus(asset.id, asset.type),
    version: manager.getAssetPackageVersion(asset.id, asset.type),
    contentType: manager.getAssetPackageContentType(asset.id, asset.type),
  };
}

export async function upgradeAssetPackage(request: AssetPackageUpgradeRequest): Promise<number> {
  if (upgradeInProgress) {
    throw new Error('Upgrade asset packages sequentially because the SDK exposes one upgrading callback slot.');
  }
  if (!request.id || !request.packageFileName || /[\\/]/.test(request.packageFileName)) {
    throw new Error('Provide the package ID and original package file name without directory separators.');
  }
  if (request.licenseUrl && (!request.licenseFileName || /[\\/]/.test(request.licenseFileName))) {
    throw new Error('Provide the original license file name without directory separators.');
  }
  const manager = nvsGetStreamingContextInstance().getAssetPackageManager();
  const status = manager.getAssetPackageStatus(request.id, request.type);
  if (status !== NvsAssetPackageStatusEnum.Ready) {
    throw new Error('Only a Ready installed package can be upgraded; install or finish its current operation first.');
  }
  const installedVersion = manager.getAssetPackageVersion(request.id, request.type);
  if (request.expectedVersion !== undefined && request.expectedVersion <= installedVersion) {
    return installedVersion;
  }

  upgradeInProgress = true;
  const fsRoot = assetPackageRoot(request.type);
  let packagePath = '';
  let licensePath = '';
  try {
    packagePath = await fetchToSdkFs(request.packageUrl, `/${fsRoot}/${request.packageFileName}`, [fsRoot]);
    if (request.licenseUrl) {
      licensePath = await fetchToSdkFs(request.licenseUrl, `/${fsRoot}/${request.licenseFileName}`, [fsRoot]);
    }
  } catch (error) {
    if (packagePath) removeFromSdkFs(packagePath, [fsRoot]);
    if (licensePath) removeFromSdkFs(licensePath, [fsRoot]);
    upgradeInProgress = false;
    throw error;
  }

  const timeoutMs = request.timeoutMs ?? 30_000;
  if (timeoutMs <= 0) {
    removeFromSdkFs(packagePath, [fsRoot]);
    if (licensePath) removeFromSdkFs(licensePath, [fsRoot]);
    upgradeInProgress = false;
    throw new Error('timeoutMs must be positive.');
  }

  return new Promise<number>((resolve, reject) => {
    const previous = manager.onFinishAssetPackageUpgrading;
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (manager.onFinishAssetPackageUpgrading === handler) {
        manager.onFinishAssetPackageUpgrading = previous;
      }
      removeFromSdkFs(packagePath, [fsRoot]);
      if (licensePath) removeFromSdkFs(licensePath, [fsRoot]);
      upgradeInProgress = false;
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Asset-package upgrade timed out; inspect the SDK callback and package files.'));
    }, timeoutMs);
    const handler = (id: string, _path: string, type: number, error: number) => {
      try {
        previous?.(id, _path, type, error);
      } catch (callbackError) {
        console.error('Previous asset-package upgrade callback failed:', callbackError);
      }
      if (id !== request.id || type !== request.type) return;
      cleanup();
      if (error !== NvsAssetPackageErrorEnum.NoError) {
        reject(new Error(`Asset-package upgrade failed with code ${error}.`));
        return;
      }
      const version = manager.getAssetPackageVersion(request.id, request.type);
      if (request.expectedVersion !== undefined && version < request.expectedVersion) {
        reject(new Error(`Upgrade callback succeeded, but installed version ${version} is below ${request.expectedVersion}.`));
        return;
      }
      resolve(version);
    };
    manager.onFinishAssetPackageUpgrading = handler;
    let immediate: number;
    try {
      immediate = manager.upgradeAssetPackage(packagePath, licensePath, request.type);
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }
    if (immediate !== NvsAssetPackageErrorEnum.NoError) {
      cleanup();
      reject(new Error(`Asset-package upgrade could not start: ${immediate}.`));
    }
  });
}

export function uninstallAssetPackage(context: NvsStreamingContext, asset: AssetPackageRef): void {
  const manager = context.getAssetPackageManager();
  const status = manager.getAssetPackageStatus(asset.id, asset.type);
  if (status === NvsAssetPackageStatusEnum.NotInstalled) return;
  if (status === NvsAssetPackageStatusEnum.Installing || status === NvsAssetPackageStatusEnum.Upgrading) {
    throw new Error('Wait for the asset-package operation to finish before uninstalling.');
  }
  const result = manager.uninstallAssetPackage(asset.id, asset.type);
  if (result !== NvsAssetPackageErrorEnum.NoError) {
    throw new Error(`Asset-package uninstall failed with code ${result}.`);
  }
  if (manager.getAssetPackageStatus(asset.id, asset.type) !== NvsAssetPackageStatusEnum.NotInstalled) {
    throw new Error('The SDK returned success but the asset package is still installed.');
  }
}
