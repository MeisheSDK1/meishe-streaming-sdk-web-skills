export interface ReadonlySdkVector<T> {
  size(): number;
  get(index: number): T;
}

export interface MutableSdkVector<T> extends ReadonlySdkVector<T> {
  push_back(value: T): void;
}

export function createSdkVector<T>(values: Iterable<T>): NvsVectorVal {
  // sdk.d.ts intentionally leaves the generated NvsVectorVal methods untyped,
  // while the 3.16.0 runtime exposes the embind push_back/size/get methods.
  const vector = new NvsVectorVal() as NvsVectorVal & MutableSdkVector<T>;
  for (const value of values) vector.push_back(value);
  return vector;
}

export function sdkVectorToArray<T>(vector: ReadonlySdkVector<T> | null | undefined): T[] {
  if (!vector) return [];
  const values: T[] = [];
  for (let index = 0; index < vector.size(); index += 1) {
    values.push(vector.get(index));
  }
  return values;
}

export function findInSdkVector<T>(
  vector: ReadonlySdkVector<T> | null | undefined,
  predicate: (value: T, index: number) => boolean,
): T | undefined {
  if (!vector) return undefined;
  for (let index = 0; index < vector.size(); index += 1) {
    const value = vector.get(index);
    if (predicate(value, index)) return value;
  }
  return undefined;
}
