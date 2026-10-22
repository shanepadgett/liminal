/** A best guess at the value of JSON text cut off mid-stream, such as a tool call's params so far. */
import { Array as Arr, Option, Schema } from "effect";

type Open = "{" | "[";

/** A place to cut the text so that closing what is open there makes valid JSON. */
interface Cut {
  readonly at: number;
  readonly open: ReadonlyArray<Open>;
}

/** What the scan knows after each character. */
interface Scan {
  readonly open: ReadonlyArray<Open>;
  readonly string: "none" | "key" | "value";
  /** The last character was a backslash inside a string. */
  readonly escaped: boolean;
  /** The last character outside a string that is not white space or part of a number or literal. */
  readonly last: string;
  readonly cut: Cut;
}

const empty: Scan = {
  open: [],
  string: "none",
  escaped: false,
  last: "",
  cut: { at: 0, open: [] },
};

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));

const closersOf = (open: ReadonlyArray<Open>) =>
  open
    .toReversed()
    .map((each) => (each === "{" ? "}" : "]"))
    .join("");

/** A string that opens right after `{` or `,` in an object is a key. */
const isKeyStart = (scan: Scan) =>
  scan.open.at(-1) === "{" && (scan.last === "{" || scan.last === ",");

const readString = (scan: Scan, char: string, at: number): Scan => {
  if (scan.escaped) return { ...scan, escaped: false };
  if (char === "\\") return { ...scan, escaped: true };
  if (char !== '"') return scan;

  const cut = scan.string === "value" ? { at: at + 1, open: scan.open } : scan.cut;

  return { ...scan, string: "none", last: char, cut };
};

/** A comma cuts before itself, so the value before it is kept even when it is a number. */
const readStructure = (scan: Scan, char: string, at: number): Scan => {
  if (char === '"') return { ...scan, string: isKeyStart(scan) ? "key" : "value" };
  if (char === ",") return { ...scan, last: char, cut: { at, open: scan.open } };

  if (char === "{" || char === "[") {
    const open: ReadonlyArray<Open> = [...scan.open, char];

    return { ...scan, open, last: char, cut: { at: at + 1, open } };
  }

  if (char === "}" || char === "]") {
    const open = scan.open.slice(0, -1);

    return { ...scan, open, last: char, cut: { at: at + 1, open } };
  }

  return scan;
};

const scanText = (text: string): Scan => {
  let scan = empty;

  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    scan = scan.string === "none" ? readStructure(scan, char, at) : readString(scan, char, at);
  }

  return scan;
};

/**
 * The value of `text`, which may stop anywhere: an open string value is closed, a half-written key
 * or value is cut, then each open object and array is closed. `{}` until anything parses.
 */
export const parsePartial = (text: string): Schema.Json => {
  const scan = scanText(text);
  const closers = closersOf(scan.open);
  const body = scan.escaped ? text.slice(0, -1) : text;

  const guesses = [
    ...(scan.string === "value" ? [`${body}"${closers}`] : []),
    `${text}${closers}`,
    `${text.slice(0, scan.cut.at)}${closersOf(scan.cut.open)}`,
  ];

  return Option.getOrElse(
    Arr.findFirst(guesses, (guess) => decodeJson(guess)),
    () => ({}),
  );
};
