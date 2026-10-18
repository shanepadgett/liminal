/** An instruction file's front matter: `always: true` or `read-when: <situation>`. */

import { Option, Result } from "effect";

import type { FileText } from "@liminal/context/contract";

/** When the model follows a file: in every prompt, or once it reads it in a situation. */
export type Rule =
  | { readonly type: "always" }
  | { readonly type: "read-when"; readonly situation: string };

export interface Instruction {
  readonly path: string;
  /** The text after the front matter. */
  readonly body: string;
  readonly rule: Rule;
}

export const frontMatterProblem = "front matter needs `always: true` or `read-when: <situation>`.";

const FENCE = "---";

/** The `key: value` pairs between the opening and closing `---` lines, and the text after. */
const split = (text: string) => {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines[0]?.trim() !== FENCE) return Option.none();

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (end === -1) return Option.none();

  const pairs = new Map(
    lines.slice(1, end).flatMap((line): ReadonlyArray<readonly [string, string]> => {
      const colon = line.indexOf(":");

      return colon === -1 ? [] : [[line.slice(0, colon).trim(), line.slice(colon + 1).trim()]];
    }),
  );

  return Option.some({
    pairs,
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
  });
};

const ruleOf = (pairs: ReadonlyMap<string, string>): Rule | undefined => {
  if (pairs.get("always") === "true") return { type: "always" };
  const situation = pairs.get("read-when");

  return situation === undefined || situation === "" ? undefined : { type: "read-when", situation };
};

/** The file as an instruction, or the problem with its front matter. */
export const parseInstruction = (file: FileText): Result.Result<Instruction, string> => {
  const parsed = Option.flatMap(split(file.text), ({ pairs, body }) =>
    Option.map(Option.fromUndefinedOr(ruleOf(pairs)), (rule) => ({ path: file.path, body, rule })),
  );

  return Result.fromOption(parsed, () => frontMatterProblem);
};
