// src/utils/gridRows.ts
// Per plans/album implementation plan.md §2a: splits a flat array into
// row-arrays of `columns` items each (the last row may be shorter), so a
// SectionList can render one row per list item instead of mounting every
// item at once inside a wrapped, unvirtualized View. In list mode `columns`
// is already 1 via the existing `gridColumns(viewMode)` call, so this
// naturally degenerates to one item per row with no special-casing needed
// by callers.
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  const safeColumns = Math.max(1, columns);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += safeColumns) {
    rows.push(items.slice(i, i + safeColumns));
  }
  return rows;
}
