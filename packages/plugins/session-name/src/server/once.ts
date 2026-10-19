/**
 * The check that lets `name_session` run once. The tool stays in the model's tool list, so the
 * cached request prefix is unchanged; later names come from `checkpoint`.
 */

import { Effect } from "effect";

import { NamedEntry, type SessionLog } from "@liminal/session-log/contract";
import { type ToolCheck, ToolDecision } from "@liminal/tools/contract";

import { nameTool } from "../contract.ts";

/** What a repeat call is told; also the tool's own failure when the check never ran. */
export const alreadyNamed =
  "This session already has a name. It changes at your next checkpoint, through its name field.";

export const onceCheck =
  (log: SessionLog["Service"]): ToolCheck =>
  (call, tool) => {
    if (tool.spec.name !== nameTool) return Effect.succeed(ToolDecision.Allow());

    return log.read(call.sessionId, {}).pipe(
      Effect.map((entries) =>
        entries.some((entry) => entry.kind === NamedEntry.kind)
          ? ToolDecision.Deny({ reason: alreadyNamed })
          : ToolDecision.Allow(),
      ),
      Effect.catch((error) =>
        Effect.as(Effect.logWarning("session name check failed", error), ToolDecision.Allow()),
      ),
    );
  };
