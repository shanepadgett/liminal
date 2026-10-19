/** Runs one script in codemode's interpreter and words its result as the text the model reads. */

import { CodeMode, type Tool as ScriptTool } from "@opencode/codemode";
import { Duration, Effect, Predicate, Schema } from "effect";

const MEBIBYTE = 1_048_576;

/**
 * The most result and log bytes the interpreter keeps; longer output is cut by the tool output
 * plugin after.
 */
const maxOutputBytes = 10 * MEBIBYTE;

/** The text of one script's run, and whether it failed. */
export interface ScriptResult {
  readonly text: string;
  readonly isFailure: boolean;
}

const valueText = (value: Schema.Json) =>
  Predicate.isString(value) ? value : JSON.stringify(value, null, 2);

const cut = (result: CodeMode.Result) => (result.truncated === true ? ["[output cut]"] : []);

/** Logs first, then the returned value or the error, then warnings. */
export const resultOf = (result: CodeMode.Result): ScriptResult => {
  const logs = result.logs ?? [];

  if (!result.ok) {
    const { kind, message, location } = result.error;
    const where = location === undefined ? "" : ` (line ${location.line})`;
    const text = [...logs, ...cut(result), `${kind}${where}: ${message}`].join("\n");

    return { text, isFailure: true };
  }

  const value = result.value === null ? [] : [valueText(result.value)];
  const warnings = (result.warnings ?? []).map(({ kind, message }) => `${kind}: ${message}`);
  const text = [...logs, ...value, ...cut(result), ...warnings].join("\n");

  return { text: text === "" ? "(no output)" : text, isFailure: false };
};

/** Runs `code` with `functions` as its `tools`, stopped after `timeout`. */
export const runScript = (
  code: string,
  functions: Record<string, ScriptTool.Tool>,
  timeout: Duration.Duration,
) =>
  CodeMode.execute({
    code,
    tools: functions,
    limits: { timeoutMs: Duration.toMillis(timeout), maxOutputBytes },
  }).pipe(Effect.map(resultOf));
