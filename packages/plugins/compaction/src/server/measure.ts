/** Measures a session: its log, its notes and memories, the model's view and how full it is. */

import { Effect } from "effect";

import type { Models } from "@liminal/models/contract";
import type { Entry, ModelRef, SessionId } from "@liminal/sdk";
import type { Settings } from "@liminal/settings/contract";

import { CompactionSettings } from "../contract.ts";
import { budgetOf, type Stage, sizeOf, stageOf } from "./budget.ts";
import type { Memories } from "./store.ts";
import { measuredSince, type Stored, viewOf } from "./view.ts";

/** What measuring reads with. */
export interface MeasureDeps {
  readonly memories: Memories["Service"];
  readonly models: Models["Service"];
  readonly settings: Settings["Service"];
}

export interface Measured {
  readonly entries: ReadonlyArray<Entry>;
  readonly stored: Stored;
  readonly view: ReadonlyArray<Entry>;
  readonly budget: number;
  readonly size: number;
  readonly stage: Stage;
}

const defaultSettings: CompactionSettings = { budget: 200_000 };

/** The session, whose log holds `entries`, measured against `model`'s context window. */
export const measure = Effect.fn("compaction.measure")(function* (
  deps: MeasureDeps,
  session: SessionId,
  entries: ReadonlyArray<Entry>,
  model: ModelRef,
) {
  const stored: Stored = {
    notes: yield* deps.memories.notes(session),
    memories: yield* deps.memories.memories(session),
  };

  const settings = yield* deps.settings
    .section("compaction", CompactionSettings)
    .pipe(
      Effect.catchTag("SettingsInvalid", (error) =>
        Effect.as(
          Effect.logWarning(`compaction settings ignored: ${error.message}`),
          defaultSettings,
        ),
      ),
    );

  const info = yield* deps.models.describe(model);
  const budget = budgetOf(info.contextWindow, settings.budget);
  const view = viewOf(entries, stored);
  const size = sizeOf(view, measuredSince(entries));

  return { entries, stored, view, budget, size, stage: stageOf(size, budget) } satisfies Measured;
});
