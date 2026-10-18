/**
 * Where a typed query falls in a suggestion: each query character in order, ignoring case, as the
 * indices of the text it matched. None when the text does not hold the query in order.
 */
export const matchIndices = (query: string, text: string): ReadonlySet<number> | undefined => {
  const lowerText = text.toLowerCase();
  const indices = new Set<number>();
  let from = 0;

  for (const char of query.toLowerCase()) {
    const found = lowerText.indexOf(char, from);

    if (found === -1) {
      return undefined;
    }

    indices.add(found);
    from = found + 1;
  }

  return indices;
};

/** A stretch of text whose characters the query all matched, or all missed. */
export interface MatchRun {
  readonly text: string;
  readonly matched: boolean;
}

/** `text` split into runs by whether `matches` holds each UTF-16 index. */
export const matchRuns = (text: string, matches: ReadonlySet<number>) => {
  const runs: Array<MatchRun> = [];

  for (let index = 0; index < text.length; index += 1) {
    const matched = matches.has(index);
    const last = runs.at(-1);

    if (last?.matched === matched)
      runs[runs.length - 1] = { text: last.text + text.charAt(index), matched };
    else runs.push({ text: text.charAt(index), matched });
  }

  return runs;
};
