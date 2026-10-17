/** Settings files as text: parsing JSONC, merging layers, and editing in place. */

import { Predicate, Result, Schema } from "effect";
import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from "jsonc-parser";

/** A parsed settings file: section name to section value. */
export type SettingsFile = Readonly<Record<string, Schema.Json>>;

const isJson = Schema.is(Schema.Json);

const isObject = (value: Schema.Json | undefined): value is SettingsFile =>
  Predicate.isObject(value) && !Array.isArray(value);

/** `text` as a settings file; empty text is `{}`. */
export const parseSettings = (text: string): Result.Result<SettingsFile, string> => {
  const errors: Array<ParseError> = [];

  const parsed: unknown = parse(text, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  const [first] = errors;

  if (first !== undefined) {
    return Result.fail(`${printParseErrorCode(first.error)} at offset ${first.offset}`);
  }

  if (parsed === undefined) return Result.succeed({});

  if (!isJson(parsed) || !isObject(parsed)) {
    return Result.fail("the file must hold one JSON object");
  }

  return Result.succeed(parsed);
};

/** `higher` over `lower`: objects merge key by key; any other value, lists too, comes from `higher`. */
export const merge = (lower: Schema.Json | undefined, higher: Schema.Json | undefined) => {
  if (higher === undefined) return lower;
  if (!isObject(lower) || !isObject(higher)) return higher;

  const merged: Record<string, Schema.Json> = Object.fromEntries(Object.entries(lower));

  for (const [key, value] of Object.entries(higher)) {
    const next = merge(lower[key], value);
    if (next !== undefined) merged[key] = next;
  }

  return merged;
};

/** Section `name` across `files`, each over the one before it; a missing section is `{}`. */
export const mergeSection = (files: ReadonlyArray<SettingsFile>, name: string): Schema.Json => {
  let merged: Schema.Json | undefined = {};
  for (const file of files) merged = merge(merged, file[name]);

  return merged ?? {};
};

/** `text` with the value at `path` set, or removed when `value` is `undefined`; comments stay. */
export const editSettings = (
  text: string,
  path: ReadonlyArray<string>,
  value: Schema.Json | undefined,
) =>
  applyEdits(
    text,
    modify(text, [...path], value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
    }),
  );
