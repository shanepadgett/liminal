/** An instruction file's front matter: `always: true` or `read-when: <situation>`. */

import { Option, Result } from "effect";

import { type FileText, splitFrontMatter } from "@liminal/context/contract";

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

const ruleOf = (pairs: ReadonlyMap<string, string>): Rule | undefined => {
  if (pairs.get("always") === "true") return { type: "always" };
  const situation = pairs.get("read-when");

  return situation === undefined || situation === "" ? undefined : { type: "read-when", situation };
};

/** The file as an instruction, or the problem with its front matter. */
export const parseInstruction = (file: FileText): Result.Result<Instruction, string> => {
  const parsed = Option.flatMap(splitFrontMatter(file.text), ({ pairs, body }) =>
    Option.map(Option.fromUndefinedOr(ruleOf(pairs)), (rule) => ({ path: file.path, body, rule })),
  );

  return Result.fromOption(parsed, () => frontMatterProblem);
};
