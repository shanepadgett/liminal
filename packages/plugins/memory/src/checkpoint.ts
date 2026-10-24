/** A checkpoint: memories brought up to date, the point logged, the prompt and tool list folded. */
import { Effect } from "effect";

import type { SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import type { SystemPrompt } from "@shanepadgett/liminal-system-prompt/contract";
import type { ToolList } from "@shanepadgett/liminal-tool-definitions/contract";

import { CheckpointMade, type Trigger } from "./contract.ts";
import { scan } from "./scan.ts";
import type { Writer } from "./writer.ts";

export interface CheckpointServices {
  readonly log: SessionLog["Service"];
  readonly writer: Writer;
  readonly systemPrompt: SystemPrompt["Service"];
  readonly toolList: ToolList["Service"];
}

/**
 * Checkpoints `session`: waits for every memory that is due, logs where the context starts over,
 * then logs the system prompt and tool list again so change notes before it drop out. `files` are
 * the paths read back for the model.
 */
export const makeCheckpoint = (services: CheckpointServices) =>
  Effect.fn("Memory.checkpoint")(function* (
    session: SessionId,
    trigger: Trigger,
    files: ReadonlyArray<string>,
  ) {
    const { log, writer, systemPrompt, toolList } = services;
    yield* writer.settle(session);

    const events = yield* log.read(session);
    const scanned = scan(events);
    const from = scanned.uncovered[0]?.seq ?? (events.at(-1)?.seq ?? 0) + 1;
    const memories = scanned.memories.map(({ seq }) => seq);

    yield* log.append(session, [yield* CheckpointMade.make({ trigger, memories, from, files })]);
    yield* systemPrompt.fold(session);
    yield* toolList.fold(session);
  });

export type Checkpoint = ReturnType<typeof makeCheckpoint>;
