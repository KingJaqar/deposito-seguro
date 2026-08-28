// src/utils/wrapAtLength.ts
// Shared pure string-wrapping helper, consolidating the identical local copy
// duplicated across dashboard.tsx, favorites.tsx, folder/[id].tsx, search.tsx,
// and FileInfoCard.tsx. Authored fresh per plans/you-are-a-senior-majestic-
// swing.md's Phase 0 note — the file of the same name from the discarded
// working-tree pass is untracked and does not survive the reset, but its
// behavior (hard-chunk at maxLength) matches what every one of those five
// local copies already does, so this is a like-for-like consolidation.

export const wrapAtLength = (text: string, maxLength = 60): string[] => {
  if (!text) return [];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    lines.push(text.slice(i, i + maxLength));
  }
  return lines;
};
