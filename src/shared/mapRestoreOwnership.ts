/**
 * Ownership of pending map-entry rollbacks. A same-value write is still a new
 * commit, so comparing the entry's value is not sufficient to detect it.
 * Callers must invalidate ownership before every write to a guarded entry.
 */
const ownersByMap = new WeakMap<object, Map<unknown, symbol>>();

export function invalidateMapRestore(map: object, key: unknown): void {
  ownersByMap.get(map)?.delete(key);
}

export function clearMapRestores(map: object): void {
  ownersByMap.delete(map);
}

export function claimMapRestore(map: object, key: unknown): () => boolean {
  let owners = ownersByMap.get(map);
  if (!owners) {
    owners = new Map();
    ownersByMap.set(map, owners);
  }
  const owner = Symbol("map-restore");
  owners.set(key, owner);
  return () => ownersByMap.get(map)?.get(key) === owner;
}
