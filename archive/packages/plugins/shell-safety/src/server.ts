/** Shell safety's server: parses a command line with `unbash` and checks every command in it. */

import { Layer, Option } from "effect";
import { type Command, parse } from "unbash";

import { ShellSafety } from "./contract.ts";
import { builtInAllows, needsKnownArgs } from "./server/rules.ts";
import { dynamic, staticValue, walk } from "./server/walk.ts";

const parsed = Option.liftThrowable(parse);

/** The line's simple commands and shape, or none when the parser gave up on it. */
const walked = (line: string) => Option.map(parsed(line), walk);

/** The command's name and arguments, each `dynamic` when only the shell knows its value. */
const wordsOf = (command: Command): ReadonlyArray<string> =>
  [...(command.name === undefined ? [] : [command.name]), ...command.args].map(staticValue);

const tokensOf = (prefixes: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<string>> =>
  prefixes.map((prefix) => prefix.trim().split(/\s+/u)).filter((tokens) => tokens[0] !== "");

/** True when the command's first words are exactly one prefix's words. */
const startsWithAny = (
  words: ReadonlyArray<string>,
  prefixes: ReadonlyArray<ReadonlyArray<string>>,
): boolean => prefixes.some((tokens) => tokens.every((token, index) => words[index] === token));

const commandAllowed = (
  words: ReadonlyArray<string>,
  extra: ReadonlyArray<ReadonlyArray<string>>,
): boolean => {
  const [name, ...args] = words;

  if (name === undefined || name === dynamic) return false;
  if (startsWithAny(words, extra)) return true;
  if (needsKnownArgs(name) && args.includes(dynamic)) return false;

  return builtInAllows(name, args);
};

/** `cd` then `git` can run git in a repository outside the workspace, with its config and hooks. */
const leavesWithGit = (lines: ReadonlyArray<ReadonlyArray<string>>) =>
  lines.some((words) => words[0] === "cd") && lines.some((words) => words[0] === "git");

const isSafe = (line: string, extra: ReadonlyArray<string>): boolean => {
  const prefixes = tokensOf(extra);

  return Option.match(walked(line), {
    onNone: () => false,
    onSome: ({ commands, safe }) => {
      const lines = commands.map(wordsOf);

      return (
        safe && !leavesWithGit(lines) && lines.every((words) => commandAllowed(words, prefixes))
      );
    },
  });
};

const matchesAny = (line: string, prefixes: ReadonlyArray<string>): boolean => {
  const tokens = tokensOf(prefixes);

  return Option.match(walked(line), {
    onNone: () => false,
    onSome: ({ commands }) => commands.some((command) => startsWithAny(wordsOf(command), tokens)),
  });
};

export const layer = Layer.succeed(ShellSafety, ShellSafety.of({ isSafe, matchesAny }));
