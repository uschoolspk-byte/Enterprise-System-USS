/** Merge entity lists — later arrays override earlier ones for the same id. */
export function mergePreferLatest<T extends { id: string }>(
  ...sources: (T[] | undefined | null)[]
): T[] {
  const map = new Map<string, T>();
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item?.id) continue;
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}
