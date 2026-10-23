declare module 'meishewasmloader' {
  export function WASMLoader(config: {
    showLoader?(state: string): void;
    showError?(error: unknown): void;
    loadingFinished?(): void;
  }): unknown;
}

declare module 'mediabunny' {
  export const MP3: unknown;
  export const MP4: unknown;
  export const QTFF: unknown;
  export const WAVE: unknown;
  export class BlobSource {
    constructor(file: File);
  }
  export class UrlSource {
    constructor(url: string);
  }
  export class Input {
    constructor(options: { source: BlobSource | UrlSource; formats: unknown[] });
    getFormat(): Promise<{ name: string }>;
    getTracks(): Promise<any[]>;
    computeDuration(): Promise<number>;
    dispose(): void;
  }
}

declare module '*.css';

declare module 'react' {
  export type ReactNode = unknown;
  export interface RefObject<T> { current: T | null }
  export interface ChangeEvent<T> { target: T }
  export interface PointerEvent<T> {
    button: number;
    buttons: number;
    clientX: number;
    currentTarget: T;
    pointerId: number;
    preventDefault(): void;
    stopPropagation(): void;
  }
  export function useEffect(effect: () => void | (() => void), dependencies: unknown[]): void;
  export function useRef<T>(value: T): RefObject<T>;
  export function useState<T>(value: T): [T, (value: T | ((current: T) => T)) => void];
}

declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements { [element: string]: any }
}
