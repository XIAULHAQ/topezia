/**
 * Diffing for the tailor-resume panel — shows a person exactly what an AI
 * tailoring pass changed before they download or apply, which is the real
 * safety net now that the tailor route trusts its grounding prompt the same
 * way /api/resume/assist already does (see that route's comments).
 *
 * Hand-rolled, not a dependency: this codebase has no diff library, and both
 * diffs here are short enough that adding one would be overkill.
 *
 * Two shapes, matching what actually needs diffing in a resume:
 *  - diffList (skills, and each role's bullets): CONTENT-based, not
 *    position-based. Tailoring's whole point is to REORDER these lists —
 *    a sequence/LCS diff would show nearly every item as "removed here,
 *    re-added there" the moment order changes at all, drowning the one
 *    signal that actually matters (did the *content* change) in noise from
 *    a signal nobody asked to see (did the *position* change). So an item
 *    present in both lists is "same" regardless of where it moved; only
 *    items whose text is genuinely absent from the other side count as
 *    removed/added — which also covers a reworded bullet correctly, since
 *    its old and new wording are different strings.
 *  - diffWords (the summary paragraph): position-based LCS over whitespace
 *    tokens. Unlike a list of skills, word ORDER in a sentence is part of
 *    the content — rearranging words changes meaning, so this one keeps
 *    the standard sequence-diff behavior.
 */

export type DiffItem<T> = { value: T; changed: boolean };

/**
 * Content diff, ignoring position. Returns the old list (items only in old
 * marked `changed: true` — render red/struck-through) and the new list
 * (items only in new marked `changed: true` — render green), each in its
 * own original order. A repeated key consumes one occurrence per side, so
 * a duplicate that survives unchanged doesn't get misclassified.
 */
export function diffList<T>(oldItems: T[], newItems: T[], key: (t: T) => string): { old: DiffItem<T>[]; new: DiffItem<T>[] } {
  const newCounts = new Map<string, number>();
  for (const item of newItems) newCounts.set(key(item), (newCounts.get(key(item)) ?? 0) + 1);
  const old: DiffItem<T>[] = oldItems.map((item) => {
    const k = key(item);
    const remaining = newCounts.get(k) ?? 0;
    if (remaining > 0) { newCounts.set(k, remaining - 1); return { value: item, changed: false }; }
    return { value: item, changed: true };
  });

  const oldCounts = new Map<string, number>();
  for (const item of oldItems) oldCounts.set(key(item), (oldCounts.get(key(item)) ?? 0) + 1);
  const newList: DiffItem<T>[] = newItems.map((item) => {
    const k = key(item);
    const remaining = oldCounts.get(k) ?? 0;
    if (remaining > 0) { oldCounts.set(k, remaining - 1); return { value: item, changed: false }; }
    return { value: item, changed: true };
  });

  return { old, new: newList };
}

/** LCS word diff — used for prose (the summary), where word order matters. */
export function diffWords(oldText: string, newText: string): { old: DiffItem<string>[]; new: DiffItem<string>[] } {
  const split = (s: string) => s.split(/(\s+)/).filter((t) => t.length > 0);
  const a = split(oldText), b = split(newText);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const old: DiffItem<string>[] = [];
  const newList: DiffItem<string>[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      old.push({ value: a[i], changed: false });
      newList.push({ value: b[j], changed: false });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      old.push({ value: a[i], changed: true });
      i++;
    } else {
      newList.push({ value: b[j], changed: true });
      j++;
    }
  }
  while (i < n) { old.push({ value: a[i], changed: true }); i++; }
  while (j < m) { newList.push({ value: b[j], changed: true }); j++; }
  return { old, new: newList };
}
