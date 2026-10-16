/**
 * What a tool call shows, whatever the tool: its verb, the thing it acted on, and once it is done,
 * a short summary for its line and the body its block opens to.
 */

import type { JSX } from "@opentui/solid";

import type { RoleColor } from "../../tokens/roles.ts";
import type { Outcome } from "../entries.ts";

export type Result = { readonly summary: string; readonly body: (color: RoleColor) => JSX.Element };

export type ToolFace = {
  readonly verb: string;
  /** The verb while the call is the current action: `Reading`. */
  readonly activeVerb: string;
  readonly subject: string;
  /** What the block shows while the call waits on the user, for calls that do. */
  readonly waitingBody?: (color: RoleColor) => JSX.Element;
  /** Absent until the call is done. */
  readonly result: Result | undefined;
};

/** The result's face once the call is done. */
export const resultOf = <Value>(
  outcome: Outcome<Value>,
  describe: (value: Value) => Result,
): Result | undefined => (outcome.status === "done" ? describe(outcome.result) : undefined);
