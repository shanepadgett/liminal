/**
 * Turns as kernel-held work: a started turn runs step by step on whichever graph is current, and
 * one left running by a stopped process resumes when agent-loop builds.
 */

import { Effect, Schema } from "effect";

import { draft, type Entry, type EntryDraft, type SessionId, TurnGate, Work } from "@liminal/sdk";
import {
  EntryKinds,
  SessionLog,
  TurnEndedEntry,
  type TurnEndReason,
  TurnSettings,
  TurnStartedEntry,
} from "@liminal/session-log/contract";

import { AgentLoop, StepOutcome } from "../contract.ts";
import { stoppedNotice } from "./stopped.ts";

const markers = [TurnStartedEntry, TurnEndedEntry];

const keyOf = (sessionId: SessionId) => `agent-loop/turn/${sessionId}`;

const ended = (end: TurnEndReason) => draft(TurnEndedEntry, { data: { end }, text: "" });

/** What a held turn saves when it ends: a notice first when an error stopped it. */
type Drafts = readonly [EntryDraft, ...ReadonlyArray<EntryDraft>];

const isStarted = (entry: Entry) => entry.kind === TurnStartedEntry.kind;

export const makeTurns = Effect.fn("makeTurns")(function* (log: SessionLog["Service"]) {
  const work = yield* Work;
  const gate = yield* TurnGate;
  const kinds = yield* EntryKinds;
  for (const kind of markers) yield* kinds.register(kind);

  /**
   * Runs steps until the turn ends, each on the graph current when it starts. The turn holds the
   * gate, so new code applies only once it ends.
   */
  const drive = (sessionId: SessionId, settings: TurnSettings) =>
    Effect.gen(function* () {
      for (;;) {
        const outcome = yield* work.use(AgentLoop, (loop) => loop.step(sessionId, settings));
        if (StepOutcome.$is("Answered")(outcome)) return "answered" as const;
        if (StepOutcome.$is("EndedByPlugin")(outcome)) return "ended-by-plugin" as const;
      }
    }).pipe(
      Effect.tapError((error) => Effect.logError("turn stopped", error)),
      Effect.map((end): Drafts => [ended(end)]),
      Effect.catch((error) => Effect.succeed<Drafts>([stoppedNotice(error), ended("stopped")])),
      Effect.flatMap((drafts) =>
        work.use(SessionLog, (current) => current.append(sessionId, drafts)),
      ),
      Effect.tapError((error) => Effect.logError("turn end not saved", error)),
      Effect.ignore,
      gate.hold,
    );

  const start = Effect.fn("AgentLoop.start")(function* (
    sessionId: SessionId,
    settings: TurnSettings,
  ) {
    yield* log.append(sessionId, [draft(TurnStartedEntry, { data: settings, text: "" })]);
    yield* work.start(keyOf(sessionId), drive(sessionId, settings));
  });

  /** Sessions whose newest turn marker is a start, with the turn's settings. */
  const running = Effect.gen(function* () {
    const started = (yield* log.lastOfKinds(markers)).filter(isStarted);

    return yield* Effect.forEach(started, (entry) =>
      // Only start() writes these entries, from a decoded TurnSettings.
      Effect.map(
        Effect.orDie(Schema.decodeUnknownEffect(TurnSettings)(entry.data)),
        (settings) => ({ sessionId: entry.sessionId, settings }),
      ),
    );
  });

  const cancel = Effect.fn("AgentLoop.cancel")(function* (sessionId: SessionId) {
    const turns = yield* running;
    if (!turns.some((turn) => turn.sessionId === sessionId)) return;
    yield* work.stop(keyOf(sessionId));
    yield* log.append(sessionId, [ended("cancelled")]);
  });

  /** Starts the work of every turn left running, such as by a process that stopped. */
  const resume = Effect.gen(function* () {
    for (const turn of yield* running) {
      yield* work.start(keyOf(turn.sessionId), drive(turn.sessionId, turn.settings));
    }
  });

  return { start, cancel, resume };
});
