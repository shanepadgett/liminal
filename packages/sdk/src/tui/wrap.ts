/**
 * Text broken into lines of at most `columns`, at spaces where it can and mid-word where a word is
 * wider than a line. Counts one column per character.
 */

/** A word wider than a line, cut into line-sized pieces. */
const piecesOf = (word: string, columns: number): readonly string[] => {
  const pieces: string[] = [];

  for (let start = 0; start < word.length; start += columns) {
    pieces.push(word.slice(start, start + columns));
  }

  return pieces;
};

export const wrapWords = (text: string, columns: number): readonly string[] => {
  const lines: string[] = [];
  let line = "";

  for (const piece of text.split(/\s+/).flatMap((word) => piecesOf(word, columns))) {
    if (line === "") {
      line = piece;
    } else if (line.length + 1 + piece.length <= columns) {
      line = `${line} ${piece}`;
    } else {
      lines.push(line);
      line = piece;
    }
  }

  return line === "" ? lines : [...lines, line];
};

/** Text of several lines wrapped line by line, its blank lines kept as empty lines. */
export const wrapText = (text: string, columns: number): readonly string[] =>
  text.trim() === ""
    ? []
    : text
        .trim()
        .split("\n")
        .flatMap((line) => {
          const wrapped = wrapWords(line, columns);

          return wrapped.length === 0 ? [""] : wrapped;
        });

/** The first `count` lines, the last ending in `…` when lines were left out. */
export const clampLines = (lines: readonly string[], count: number, columns: number) => {
  if (lines.length <= count) return lines;

  const kept = lines.slice(0, count);
  const last = kept.at(-1) ?? "";
  const cut = last.length < columns ? last : last.slice(0, columns - 1).trimEnd();

  return [...kept.slice(0, -1), `${cut}…`];
};
