function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function byteToHex(value: number): string {
  return Math.round(clampUnit(value) * 255).toString(16).padStart(2, '0');
}

export function sdkColorFromCssRgba(
  red: number,
  green: number,
  blue: number,
  alpha = 1,
): NvsColor {
  if ([red, green, blue, alpha].some((value) => !Number.isFinite(value))) {
    throw new Error('Color channels must be finite numbers.');
  }
  return new NvsColor(
    clampUnit(red / 255),
    clampUnit(green / 255),
    clampUnit(blue / 255),
    clampUnit(alpha),
  );
}

export function sdkColorToCssRgba(color: NvsColor): string {
  return `rgba(${Math.round(clampUnit(color.r) * 255)}, ${Math.round(
    clampUnit(color.g) * 255,
  )}, ${Math.round(clampUnit(color.b) * 255)}, ${clampUnit(color.a)})`;
}

export function sdkColorToArgbHex(color: NvsColor): string {
  return `#${byteToHex(color.a)}${byteToHex(color.r)}${byteToHex(color.g)}${byteToHex(
    color.b,
  )}`;
}

export function sdkColorFromArgbHex(value: string): NvsColor {
  const match = /^#([0-9a-f]{8})$/i.exec(value);
  if (!match) throw new Error('Expected #AARRGGBB.');
  const hex = match[1];
  const channel = (offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return new NvsColor(channel(2), channel(4), channel(6), channel(0));
}
