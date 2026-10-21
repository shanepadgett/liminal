/** One reminder per unnamed session, after enough tool results to establish a topic. */

import { Effect, Option, Schema } from "effect";

import { BeforeCall, type BeforeCallHook, type Turn } from "@liminal/agent-loop/contract";
import { contextMessage, MessageEntry } from "@liminal/context/contract";
import { reminder } from "@liminal/sdk";
import { NamedEntry, type SessionLog, ToolResultEntry } from "@liminal/session-log/contract";

const label = "session-name/reminder";
const toolResultThreshold = 5;
const decodeMessage = Schema.decodeUnknownOption(MessageEntry.data);

export const beforeCallOf = (log: SessionLog["Service"]): BeforeCallHook =>
  Effect.fn("session-name.beforeCall")(
    function* ({ sessionId }: Turn) {
      const entries = yield* log.read(sessionId, {});

      const alreadyReminded = entries.some(
        (entry) =>
          entry.kind === MessageEntry.kind
          && Option.exists(decodeMessage(entry.data), (message) => message.label === label),
      );

      if (entries.some((entry) => entry.kind === NamedEntry.kind) || alreadyReminded)
        return BeforeCall.Proceed({ input: [] });

      const completedCalls = entries.filter((entry) => entry.kind === ToolResultEntry.kind).length;
      if (completedCalls < toolResultThreshold) return BeforeCall.Proceed({ input: [] });

      return BeforeCall.Proceed({
        input: [
          contextMessage({
            label,
            text: reminder(
              "tools",
              "This session has no name yet. If its topic is clear, call name_session at a convenient point. If it is still unclear, continue the conversation; do not interrupt the work just to name it.",
            ),
            user: "debug",
          }),
        ],
      });
    },
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning("session name reminder failed", error),
        BeforeCall.Proceed({ input: [] }),
      ),
    ),
  );
