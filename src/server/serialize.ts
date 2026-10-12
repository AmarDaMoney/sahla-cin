// Les dates quittent le serveur en chaînes ISO : types identiques côté client
// quel que soit le transport.
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export function serialize<T>(value: T): Serialized<T> {
  if (value instanceof Date) return value.toISOString() as Serialized<T>;
  if (Array.isArray(value)) return value.map(serialize) as Serialized<T>;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serialize(v)]),
    ) as Serialized<T>;
  }
  return value as Serialized<T>;
}
