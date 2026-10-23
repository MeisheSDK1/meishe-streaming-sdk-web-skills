import {
  assertSdkFsFilePath,
  assertSdkFsPath,
  type SdkFsRoot,
} from './sdk-fs-paths';

export function ensureSdkFsDirectory(
  directory: string,
  allowedRoots?: readonly SdkFsRoot[],
): void {
  const root = assertSdkFsPath(directory, allowedRoots);
  const parts = directory.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    if (FS.analyzePath(current).exists) continue;
    if (current === `/${root}`) {
      throw new Error(`SDK FS root ${current} was not initialized after WASM loading.`);
    }
    FS.mkdir(current);
  }
}

export function writeBytesToSdkFs(
  path: string,
  bytes: Uint8Array,
  allowedRoots?: readonly SdkFsRoot[],
): string {
  assertSdkFsFilePath(path, allowedRoots);
  if (bytes.byteLength === 0) throw new Error('Refuse to write an empty SDK FS resource.');
  const parent = path.slice(0, path.lastIndexOf('/')) || '/';
  ensureSdkFsDirectory(parent, allowedRoots);
  FS.writeFile(path, bytes);
  return path;
}

// Do not use this byte helper for original audio/video files. Use Meishe-transcoded
// m3u8 or registerLocalFile() plus a small WebLocal descriptor instead.

export async function fetchToSdkFs(
  url: string,
  destination: string,
  allowedRoots?: readonly SdkFsRoot[],
): Promise<string> {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Resource fetch failed with HTTP ${response.status}.`);
  }
  return writeBytesToSdkFs(destination, new Uint8Array(await response.arrayBuffer()), allowedRoots);
}

export function removeFromSdkFs(path: string, allowedRoots?: readonly SdkFsRoot[]): void {
  assertSdkFsFilePath(path, allowedRoots);
  if (FS.analyzePath(path).exists) FS.unlink(path);
}
