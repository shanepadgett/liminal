/** JSON files with comments, as the user edits them: parsing one object, and editing in place. */
import { Predicate, Result, Schema } from "effect";
import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from "jsonc-parser";

const isJson = Schema.is(Schema.Json);

/** Whether `value` is an object, not a list. */
export const isJsonObject = (value: Schema.Json | undefined): value is Schema.JsonObject =>
  Predicate.isObject(value);

/** `text` as one JSON object, comments and trailing commas allowed; empty text is `{}`. */
export const parseJsonObject = (text: string): Result.Result<Schema.JsonObject, string> => {
  const errors: Array<ParseError> = [];

  const parsed: unknown = parse(text, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  const [first] = errors;

  if (first !== undefined)
    return Result.fail(`${printParseErrorCode(first.error)} at offset ${first.offset}`);

  if (parsed === undefined) return Result.succeed({});

  if (!isJson(parsed) || !isJsonObject(parsed))
    return Result.fail("the file must hold one JSON object");

  return Result.succeed(parsed);
};

/** `text` with the value at `path` set, or removed when `value` is `undefined`; comments stay. */
export const editJson = (
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
