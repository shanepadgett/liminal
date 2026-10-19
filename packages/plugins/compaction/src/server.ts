/**
 * Compaction's server: `memories.db` in the data folder, the view step, the `checkpoint` tool, the
 * `history` tool, the forced check and the before-call hook.
 */

import { Effect, FiberMap, Layer } from "effect";

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { ViewSteps } from "@liminal/context/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { dataFile, type SessionId } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ToolChecks, Tools } from "@liminal/tools/contract";

import { CheckpointEntry, HandoffEntry, NoteEntry } from "./contract.ts";
import { beforeCallOf, type CompactionDeps } from "./server/before-call.ts";
import { checkpointToolOf, forcedCheck } from "./server/checkpoint.ts";
import { historyToolOf } from "./server/recall.ts";
import { Memories, memoriesLayer } from "./server/store.ts";
import { viewOf } from "./server/view.ts";

/** Before approval, so a full context denies without asking. */
const checkOrder = 50;

/** After steps that drop entries, so notes and the checkpoint apply to what is left. */
const viewOrder = 100;

const register = Effect.gen(function* () {
  const deps: CompactionDeps = {
    log: yield* SessionLog,
    memories: yield* Memories,
    models: yield* Models,
    task: yield* ModelTask,
    settings: yield* Settings,
  };

  const kinds = yield* EntryKinds;
  yield* kinds.register(CheckpointEntry);
  yield* kinds.register(HandoffEntry);
  yield* kinds.register(NoteEntry);

  yield* (yield* ViewSteps).register(
    (sessionId, entries) =>
      Effect.gen(function* () {
        const notes = yield* deps.memories.notes(sessionId);
        const memories = yield* deps.memories.memories(sessionId);

        return viewOf(entries, { notes, memories });
      }).pipe(Effect.orDie),
    { order: viewOrder },
  );

  const tools = yield* Tools;
  yield* tools.register(checkpointToolOf(deps));
  yield* tools.register(historyToolOf(deps.log));
  yield* (yield* ToolChecks).register(forcedCheck(deps), { order: checkOrder });

  const writers = yield* FiberMap.make<SessionId>();
  yield* (yield* BeforeCallHooks).register(beforeCallOf(deps, writers), { order: 0 });
});

const memories = Layer.unwrap(Effect.map(dataFile("memories.db"), memoriesLayer));

export const layer = Layer.effectDiscard(register).pipe(Layer.provide(memories));
