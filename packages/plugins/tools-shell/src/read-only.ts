/**
 * Proves a command line only reads, and lists every word it could read as a path. Anything the
 * parser cannot prove, such as an expansion, a subshell or an unknown command, is not read-only.
 */
import { Option } from "effect";
import {
  type AndOr,
  type Command,
  parse,
  type PipelineNode,
  type Redirect,
  type Redirection,
  type Statement,
  type Word,
  type WordPart,
} from "unbash";

import { onlyReads } from "./commands.ts";

/** The paths found so far, or `undefined` once something is not provably read-only. */
type Paths = ReadonlyArray<string> | undefined;

const WRITE_REDIRECTS = new Set([">", ">>", ">|", "&>", "&>>", "<>"]);
const LONG_VALUE = /^--[^=]+=(?<value>.*)$/su;
/** `.*` can match `..` in older bash. */
const HIDDEN_GLOB = /(?:^|\/)\.[*?[]/u;

const isPaths = (paths: Paths): paths is ReadonlyArray<string> => paths !== undefined;

const allOf = <T>(items: ReadonlyArray<T>, pathsOf: (item: T) => Paths): Paths => {
  const each = items.map(pathsOf);

  return each.every(isPaths) ? each.flat() : undefined;
};

const isStaticPart = (part: WordPart): boolean => {
  if (part.type === "DoubleQuoted" || part.type === "LocaleString") {
    return part.parts.every((child) => child.type === "Literal");
  }

  return ["Literal", "SingleQuoted", "AnsiCQuoted", "Glob"].includes(part.type);
};

/** A word's value when nothing in it expands at run time. */
const staticValue = (word: Word | undefined): string | undefined =>
  word !== undefined && (word.parts ?? []).every(isStaticPart) ? word.value : undefined;

const pathOf = (value: string): Paths => {
  const otherHome = value.startsWith("~") && value !== "~" && !value.startsWith("~/");

  return otherHome || HIDDEN_GLOB.test(value) ? undefined : [value];
};

/** An argument as a path; an option's `=` value counts, a glued short option value cannot. */
const argPathsOf = (value: string): Paths => {
  if (!value.startsWith("-")) return pathOf(value);

  const long = LONG_VALUE.exec(value)?.groups?.["value"];

  if (long !== undefined) return pathOf(long);

  return /[/~]/u.test(value) ? undefined : [];
};

const fileRedirectPaths = (redirect: Redirect): Paths => {
  const target = staticValue(redirect.target);

  if (target === undefined) return undefined;
  if (redirect.operator === "<") return pathOf(target);
  if (WRITE_REDIRECTS.has(redirect.operator)) return target === "/dev/null" ? [] : undefined;

  const descriptors = redirect.operator === "<&" ? ["0", "1", "2", "-"] : ["1", "2", "-"];

  return descriptors.includes(target) ? [] : undefined;
};

const redirectPaths = (redirect: Redirection): Paths => {
  if (redirect.type === "Redirect") return fileRedirectPaths(redirect);

  if (redirect.type === "HereString") {
    return staticValue(redirect.target) === undefined ? undefined : [];
  }

  const expands = !(redirect.delimiter?.quoted ?? false);
  const literal = (redirect.body.parts ?? []).every((part) => part.type === "Literal");

  return expands && !literal ? undefined : [];
};

const commandPaths = (command: Command): Paths => {
  const name = staticValue(command.name);
  const words = command.args.map((arg) => (arg.type === "Word" ? staticValue(arg) : undefined));
  const args = words.every((word) => word !== undefined) ? words : undefined;

  if (name === undefined || args === undefined || command.prefix.length > 0) return undefined;
  if (name.includes("/") || !onlyReads(name, args)) return undefined;

  const fromArgs = allOf(args, argPathsOf);
  const fromRedirects = allOf(command.redirects, redirectPaths);

  return fromArgs && fromRedirects ? [...fromArgs, ...fromRedirects] : undefined;
};

const nodePaths = (node: PipelineNode | AndOr): Paths => {
  if (node.type === "Command") return commandPaths(node);
  if (node.type === "AndOr") return allOf(node.commands, nodePaths);
  if (node.type !== "Pipeline") return undefined;

  const plain = node.prefixes.length === 0 && !node.operators.includes("|&");

  return plain ? allOf(node.commands, nodePaths) : undefined;
};

const statementPaths = (statement: Statement): Paths =>
  statement.background === true ? undefined : nodePaths(statement.command);

const parsed = Option.liftThrowable(parse);

/** The paths a command could read when it provably only reads; none when it may do more. */
export const readPathsOf = (command: string): Option.Option<ReadonlyArray<string>> =>
  parsed(command).pipe(
    Option.filter(
      (script) =>
        (script.errors ?? []).length === 0
        && script.shebang === undefined
        && script.commands.length > 0,
    ),
    Option.flatMap((script) => Option.fromUndefinedOr(allOf(script.commands, statementPaths))),
  );
