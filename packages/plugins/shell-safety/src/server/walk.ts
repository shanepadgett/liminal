/**
 * Walks a parsed command line, collecting every simple command in it and noting any shape that is
 * never safe, such as a background job or a write redirect.
 */

import { Match } from "effect";
import {
  type Command,
  type CommandArgument,
  forEachChild,
  type ParsedScript,
  type Redirect,
  type SyntaxNode,
  type WordPart,
} from "unbash";

/** The simple commands found, and whether the line's shape allows running without asking. */
export interface Found {
  readonly commands: ReadonlyArray<Command>;
  readonly safe: boolean;
}

/** Stands in for a word whose value is only known when the shell runs it. */
export const dynamic = "\u0000";

const literalParts = new Set(["Literal", "SingleQuoted", "AnsiCQuoted"]);

const partStatic = (part: WordPart): boolean =>
  part.type === "DoubleQuoted"
    ? part.parts.every((child) => child.type === "Literal")
    : literalParts.has(part.type);

/** The argument's value when nothing in it expands, globs included, else `dynamic`. */
export const staticValue = (argument: CommandArgument): string =>
  argument.type === "Word" && (argument.parts ?? []).every(partStatic) ? argument.value : dynamic;

/** Nodes that can run hidden code or change shell state, whatever they hold. */
const neverSafeTypes = new Set<SyntaxNode["type"]>([
  "ArithmeticExpansion",
  "ArithmeticCommand",
  "ArithmeticFor",
  "ProcessSubstitution",
  "Function",
  "Coproc",
  "Select",
]);

const writeOperators = new Set(["<>", ">", ">>", ">|", "&>", "&>>"]);
const duplicateTargets = new Set(["0", "1", "2", "-"]);

/** Reads from anywhere; writes only to `/dev/null`; duplicates only onto the standard streams. */
const redirectUnsafe = (redirect: Redirect): boolean => {
  const target = redirect.target === undefined ? dynamic : staticValue(redirect.target);

  if (redirect.descriptor?.type === "FileDescriptorVariable") return true;

  if (writeOperators.has(redirect.operator)) return target !== "/dev/null";

  if (redirect.operator === ">&" || redirect.operator === "<&")
    return !duplicateTargets.has(target);

  return false;
};

/** Assignments in front of a command can change what runs. */
const commandUnsafe = (command: Command): boolean =>
  command.name === undefined || command.prefix.some((item) => item.type === "Assignment");

const shapeUnsafe: (node: SyntaxNode) => boolean = Match.type<SyntaxNode>().pipe(
  Match.discriminators("type")({
    Script: (script: ParsedScript) =>
      (script.errors ?? []).length > 0 || script.shebang !== undefined,
    Statement: (statement) => statement.background === true,
    Command: commandUnsafe,
    Redirect: redirectUnsafe,
    CommandExpansion: (expansion) => expansion.script === undefined,
  }),
  Match.orElse((node) => neverSafeTypes.has(node.type)),
);

/** Every simple command in the script, its substitutions and heredocs included. */
export const walk = (script: ParsedScript): Found => {
  const commands: Array<Command> = [];
  let safe = true;

  const visit = (node: SyntaxNode): void => {
    if (node.type === "Command") commands.push(node);
    if (shapeUnsafe(node)) safe = false;
    forEachChild(node, visit);
  };

  visit(script);

  return { commands, safe };
};
