/** The model's `name_session` tool. */

import { Effect } from "effect";

import { defineTool, ToolFailed } from "@liminal/sdk";
import { NamedEntry, type SessionLog } from "@liminal/session-log/contract";

import { nameTool, NameParams } from "../contract.ts";
import { alreadyNamed } from "./once.ts";

export const nameToolOf = (log: SessionLog["Service"]) =>
  defineTool({
    name: nameTool,
    description: "Names this session; the name appears in the user's list of sessions.",
    guidance: [
      "Call name_session once, after the first exchange has made clear what the session is about; not on a vague opening message.",
      "A name is one plain sentence of about 10 words. Do not rename the session: it is renamed through checkpoint when its focus has changed.",
    ],
    parameters: NameParams,
    hints: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    runAlongside: true,
    safeToRerun: true,
    run: ({ name }, { sessionId }) =>
      Effect.gen(function* () {
        const entries = yield* log.read(sessionId, {});

        if (entries.some((entry) => entry.kind === NamedEntry.kind)) {
          return yield* new ToolFailed({ message: alreadyNamed });
        }

        yield* log.append(sessionId, [
          { entry: NamedEntry, data: { name }, text: `Session named: ${name}` },
        ]);

        return { result: `Session named: ${name}` };
      }).pipe(
        Effect.catchTags({
          StoreError: (error) => Effect.fail(new ToolFailed({ message: error.message })),
          SessionNotFound: () => Effect.fail(new ToolFailed({ message: "session not found" })),
          InvalidEntry: (error) => Effect.fail(new ToolFailed({ message: error.message })),
        }),
      ),
  });
