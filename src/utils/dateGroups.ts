// src/utils/dateGroups.ts
// Per plans/album implementation plan.md §2b: buckets an album's files into
// Google-Photos-style date headers ("Today" / "Yesterday" / "March 2025")
// for the album variant's SectionList. No existing bucketing utility fits —
// trash.tsx's formatDeletedAt is a local, non-exported, single-value
// relative-time formatter, not a grouping function — so this is written
// fresh.
//
// Known, accepted limitation (per the plan): grouping is by `importedAt`
// (when the file was added to the vault), not photo-taken date — this app
// doesn't extract EXIF capture dates from images. Real Google Photos groups
// by capture date; matching that would need an EXIF-reading step in the
// import pipeline, out of scope for this pass.
import type { FileMetadata } from '../types';

export interface FileDateGroup {
  label: string;
  files: FileMetadata[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const labelFor = (importedAt: number, now: number): string => {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = startOfDay(now);
  const day = startOfDay(importedAt);
  const diffDays = Math.round((today - day) / dayMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const d = new Date(importedAt);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear ? MONTH_NAMES[d.getMonth()] : `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Sorts newest-first by `importedAt` and buckets into date-labeled groups,
 * preserving newest-first order both across and within groups.
 */
export function groupFilesByDate(files: FileMetadata[], now: number = Date.now()): FileDateGroup[] {
  const sorted = [...files].sort((a, b) => b.importedAt - a.importedAt);
  const groups: FileDateGroup[] = [];
  const indexByLabel = new Map<string, number>();
  for (const file of sorted) {
    const label = labelFor(file.importedAt, now);
    const existingIdx = indexByLabel.get(label);
    if (existingIdx === undefined) {
      indexByLabel.set(label, groups.length);
      groups.push({ label, files: [file] });
    } else {
      groups[existingIdx].files.push(file);
    }
  }
  return groups;
}
