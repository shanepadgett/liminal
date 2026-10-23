/** An instruction file's front matter: `always: true` or `read-when: <situation>`. */
import { Option } from "effect";

import type { FileText } from "./files.ts";

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

const FENCE = "---";

interface FrontMatter {
  readonly pairs: ReadonlyMap<string, string>;
  readonly body: string;
}

/** The `key: value` lines between the fences, and the text after them; none without fences. */
const splitFrontMatter = (text: string): Option.Option<FrontMatter> => {
  const lines = text.split("\n");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (lines[0]?.trim() !== FENCE || end === -1) return Option.none();

  const pairs = new Map(
    lines.slice(1, end).flatMap((line) => {
      const colon = line.indexOf(":");

      return colon === -1
        ? []
        : [[line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const];
    }),
  );

  return Option.some({ pairs, body: lines.slice(end + 1).join("\n") });
};

const ruleOf = (pairs: ReadonlyMap<string, string>): Rule | undefined => {
  if (pairs.get("always") === "true") return { type: "always" };
  const situation = pairs.get("read-when");

  return situation === undefined || situation === "" ? undefined : { type: "read-when", situation };
};

/** The file as an instruction, or none when its front matter has no rule. */
export const parseInstruction = (file: FileText): Option.Option<Instruction> =>
  Option.flatMap(splitFrontMatter(file.text), ({ pairs, body }) =>
    Option.map(Option.fromUndefinedOr(ruleOf(pairs)), (rule) => ({ path: file.path, body, rule })),
  );
