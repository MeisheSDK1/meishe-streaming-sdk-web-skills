export interface LiveWindowCoordinates {
  view: NvsPointF;
  canonical: NvsPointF;
  normalized: NvsPointF;
}

export function clientPointToView(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): NvsPointF {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('The LiveWindow canvas has no visible size.');
  }
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
    throw new Error('The client point is outside the LiveWindow canvas.');
  }
  // NvsLiveWindow view coordinates use CSS pixels. The canvas backing store may
  // already be scaled by devicePixelRatio; applying that scale here would double it.
  return new NvsPointF(x, y);
}

export function mapViewPoint(
  liveWindow: NvsLiveWindow,
  viewPoint: NvsPointF,
): LiveWindowCoordinates {
  return {
    view: viewPoint,
    canonical: liveWindow.mapViewToCanonical(viewPoint),
    normalized: liveWindow.mapViewToNormalized(viewPoint),
  };
}

export function mapCanonicalPoint(
  liveWindow: NvsLiveWindow,
  canonicalPoint: NvsPointF,
): LiveWindowCoordinates {
  const view = liveWindow.mapCanonicalToView(canonicalPoint);
  return {
    view,
    canonical: canonicalPoint,
    normalized: liveWindow.mapViewToNormalized(view),
  };
}

export function mapNormalizedPoint(
  liveWindow: NvsLiveWindow,
  normalizedPoint: NvsPointF,
): LiveWindowCoordinates {
  const view = liveWindow.mapNormalizedToView(normalizedPoint);
  return {
    view,
    canonical: liveWindow.mapViewToCanonical(view),
    normalized: normalizedPoint,
  };
}

export function samplePixelAtClientPoint(
  liveWindow: NvsLiveWindow,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): NvsColor {
  return liveWindow.getPixelColor(clientPointToView(canvas, clientX, clientY));
}
