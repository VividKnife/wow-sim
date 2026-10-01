/** An owned container: callers must not mutate ordering keys after insertion. */
export class MinHeap<T> {
  private values: T[];
  private compare: (left: T, right: T) => number;
  private keyOf?: (value: T) => number | string;
  private positions = new Map<number | string, number>();
  constructor(compare: (left: T, right: T) => number, values: T[] = [], owned = false, keyOf?: (value: T) => number | string) {
    this.compare = compare; this.keyOf = keyOf;
    this.values = owned ? values : [...values];
    if (keyOf) for (let i = 0; i < this.values.length; i++) {
      const key = keyOf(this.values[i]);
      if (this.positions.has(key)) throw new Error('Duplicate heap key');
      this.positions.set(key, i);
    }
    for (let i = (this.values.length >> 1) - 1; i >= 0; i--) this.down(i);
  }
  get size() { return this.values.length; }
  peek(): T | undefined { return this.values[0]; }
  private put(index: number, value: T) {
    this.values[index] = value;
    if (this.keyOf) this.positions.set(this.keyOf(value), index);
  }
  push(value: T) {
    if (this.keyOf && this.positions.has(this.keyOf(value))) throw new Error('Duplicate heap key');
    const index = this.values.length;
    this.put(index, value); this.up(index);
  }
  pop(): T | undefined { return this.values.length ? this.removeAt(0) : undefined; }
  /** Indexed cancellation is O(log n), with no scan or tombstone allocation. */
  remove(key: number | string): T | undefined {
    if (!this.keyOf) throw new Error('Heap has no key index');
    const index = this.positions.get(key);
    return index === undefined ? undefined : this.removeAt(index);
  }
  private removeAt(index: number): T {
    const removed = this.values[index], last = this.values.pop()!;
    if (this.keyOf) this.positions.delete(this.keyOf(removed));
    if (index < this.values.length) {
      this.put(index, last);
      if (index > 0 && this.compare(last, this.values[(index - 1) >> 1]) < 0) this.up(index);
      else this.down(index);
    }
    return removed;
  }
  snapshot(): T[] { return [...this.values]; }
  private up(index: number) {
    const value = this.values[index];
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.values[parent], value) <= 0) break;
      this.put(index, this.values[parent]); index = parent;
    }
    this.put(index, value);
  }
  private down(index: number) {
    const value = this.values[index];
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.values.length && this.compare(this.values[child + 1], this.values[child]) < 0) child++;
      if (this.compare(value, this.values[child]) <= 0) break;
      this.put(index, this.values[child]); index = child;
    }
    this.put(index, value);
  }
}
