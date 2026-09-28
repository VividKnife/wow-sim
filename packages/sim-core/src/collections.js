/**
 * Group records without requiring ES2024 APIs in browser workers.
 * @template T
 * @template {PropertyKey} K
 * @param {Iterable<T>} rows
 * @param {(row: T, index: number) => K} keyOf
 * @returns {Partial<Record<K, T[]>>}
 */
export function groupRows(rows, keyOf) {
  const groups = Object.create(null);
  let index = 0;
  for (const row of rows) {
    const key = keyOf(row, index++);
    (groups[key] ??= []).push(row);
  }
  return groups;
}
