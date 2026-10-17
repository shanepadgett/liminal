/** What a repository check reports, and the file reading and printing its checks share. */
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

import { Option, Schema } from "effect";

/** One problem a repository check found, at the file it concerns. */
export interface Problem {
  readonly path: string;
  readonly message: string;
}

/** Reads a JSON file as `schema`; a missing or invalid file reads as undefined. */
export const jsonReader = <A>(schema: Schema.Codec<A, unknown>) => {
  const decode = Schema.decodeUnknownOption(Schema.fromJsonString(schema));

  return (path: string): A | undefined =>
    existsSync(path) ? Option.getOrUndefined(decode(readFileSync(path, "utf8"))) : undefined;
};

/** Prints each problem relative to the working folder and fails the process when there are any. */
export const report = (problems: ReadonlyArray<Problem>): void => {
  for (const problem of problems) {
    console.error(`${relative(process.cwd(), problem.path)}: ${problem.message}`);
  }

  process.exitCode = problems.length > 0 ? 1 : 0;
};
