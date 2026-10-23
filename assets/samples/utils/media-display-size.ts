export interface MediaDisplaySize {
  width: number;
  height: number;
}

export function getMediaDisplaySize(
  context: NvsStreamingContext,
  mediaPath: string,
): MediaDisplaySize {
  const info = context.getAVFileInfo(mediaPath, 0);
  if (!info?.videoStreamInfo) throw new Error('The SDK could not read a video stream.');

  const stream = info.videoStreamInfo as {
    width: number;
    height: number;
    rotation: number;
    pixelAspectRatio?: { num: number; den: number };
  };
  let width = stream.width;
  let height = stream.height;
  if (stream.rotation === 1 || stream.rotation === 3) {
    [width, height] = [height, width];
  }

  const pixelAspectRatio = stream.pixelAspectRatio ?? { num: 1, den: 1 };
  if (pixelAspectRatio.num <= 0 || pixelAspectRatio.den <= 0) {
    throw new Error('The media has an invalid pixel aspect ratio.');
  }
  return {
    width: width * (pixelAspectRatio.num / pixelAspectRatio.den),
    height,
  };
}
