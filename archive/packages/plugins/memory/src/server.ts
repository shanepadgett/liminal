/**
 * Memory's server: `memories.db` in the data folder, the view step, the `checkpoint` tool, the
 * `history` tool, the forced check, the before-call hook and the status the sidebar shows.
 */

import { Effect, FiberMap, FileSystem, Layer, Path } from "effect";

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { CommandRunner } from "@liminal/command-runner/contract";
import { ViewSteps } from "@liminal/context/contract";
import { WorkspaceFiles } from "@liminal/files/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { dataFile, Directories, type SessionId } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ToolChecks, Tools, ToolWrappers } from "@liminal/tools/contract";

import {
  CheckpointEntry,
  HandoffEntry,
  MemoryRpcs,
  NoteEntry,
  RestoredEntry,
  TouchedEntry,
} from "./contract.ts";
import { beforeCallOf, type MemoryDeps } from "./server/before-call.ts";
import { checkpointToolOf, forcedCheck } from "./server/checkpoint.ts";
import { historyToolOf } from "./server/recall.ts";
import { watchStatus } from "./server/status.ts";
import { Memories, memoriesLayer } from "./server/store.ts";
import { touchedWrapper } from "./server/touched.ts";
import { viewOf } from "./server/view.ts";

/** Kinds this plugin saved under its earlier name, `compaction`. */
const renamedKinds = [
  ["compaction/checkpoint", CheckpointEntry],
  ["compaction/handoff", HandoffEntry],
  ["compaction/note", NoteEntry],
] as const;

/** Inside output spilling, so the call it wraps is the tool's own run. */
const wrapperOrder = 20;

/** Before approval, so a full context denies without asking. */
const checkOrder = 50;

/** After steps that drop entries, so notes and the checkpoint apply to what is left. */
const viewOrder = 100;

const register = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  const deps: MemoryDeps = {
    log: yield* SessionLog,
    memories: yield* Memories,
    models: yield* Models,
    task: yield* ModelTask,
    settings: yield* Settings,
    files: yield* WorkspaceFiles,
    exists: (file) =>
      fs.exists(path.resolve(workspace, file)).pipe(Effect.orElseSucceed(() => false)),
  };

  const kinds = yield* EntryKinds;
  yield* kinds.register(CheckpointEntry);
  yield* kinds.register(HandoffEntry);
  yield* kinds.register(NoteEntry);
  yield* kinds.register(TouchedEntry);
  yield* kinds.register(RestoredEntry);

  yield* Effect.forEach(renamedKinds, ([from, to]) => deps.log.renameKind(from, to), {
    discard: true,
  });

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

  const wrapper = touchedWrapper({
    log: deps.log,
    runner: yield* CommandRunner,
    fs,
    path,
    workspace,
  });

  yield* (yield* ToolWrappers).register(wrapper, { order: wrapperOrder });

  const writers = yield* FiberMap.make<SessionId>();
  yield* (yield* BeforeCallHooks).register(beforeCallOf(deps, writers), { order: 0 });
});

const rpcs = MemoryRpcs.toLayer(
  Effect.gen(function* () {
    const deps = {
      log: yield* SessionLog,
      memories: yield* Memories,
      models: yield* Models,
      settings: yield* Settings,
    };

    return MemoryRpcs.of({ "memory/status": ({ session }) => watchStatus(deps, session) });
  }),
);

const memories = Layer.unwrap(Effect.map(dataFile("memories.db"), memoriesLayer));

export const layer = Layer.mergeAll(Layer.effectDiscard(register), rpcs).pipe(
  Layer.provide(memories),
);
