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
