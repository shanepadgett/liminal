/**
 * `/commit` in the TUI: runs the server's steps in order, from the checks to the push question, and
 * keeps the step the dialog shows. Each ending is one toast.
 */

import { Data, Deferred, Effect, Predicate, Schema, Stream } from "effect";
import type { RpcClient, RpcClientError, RpcGroup } from "effect/rpc";
import { type Accessor, createSignal } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import type { ToastKind } from "@liminal/sdk/tui";

import {
  commitsText,
  type CommitRpcs,
  type CommitStart,
  type PlannedCommit,
  type PushTarget,
} from "../contract.ts";

/** What the dialog shows; `Review` and `Push` wait for the user. */
export type CommitStep = Data.TaggedEnum<{
  Checking: { readonly count: number };
  Planning: { readonly model: string };
  Review: { readonly commits: ReadonlyArray<PlannedCommit> };
  Committing: { readonly index: number; readonly count: number };
  Push: { readonly target: string; readonly count: number };
  Pushing: { readonly target: string; readonly count: number };
}>;

export const CommitStep = Data.taggedEnum<CommitStep>();

/** The flow is over; `text` is the toast that says how. */
class Ended extends Schema.TaggedError<Ended, { readonly brand: unique symbol }>()("Ended", {
  text: Schema.String,
  kind: Schema.Literals(["info", "success", "warning", "error"]),
}) {}

const end = (text: string, kind: ToastKind) => new Ended({ text, kind });

const failed = (kind: ToastKind, prefix = "") =>
  Effect.mapError((error: { readonly message: string }) => end(`${prefix}${error.message}`, kind));

type Client = RpcClient.RpcClient<RpcGroup.Rpcs<typeof CommitRpcs>, RpcClientError.RpcClientError>;

/** What the flow drives: the server, how to show a step and ask, and how it ends. */
interface Steps {
  readonly client: Client;
  readonly show: (step: CommitStep) => void;
  /** Waits for the user's answer to the step on screen. */
  readonly ask: Effect.Effect<boolean>;
}

const committedText = (hashes: ReadonlyArray<string>) =>
  hashes.length === 0
    ? "Committed nothing"
    : `Committed ${commitsText(hashes.length)} (${hashes.join(", ")})`;

/** Runs the checks; anything but a pass ends the flow. */
const checked = Effect.fn("commit.checked")(function* (
  steps: Steps,
  session: SessionId,
  start: CommitStart,
) {
  steps.show(CommitStep.Checking({ count: start.checks }));
  const outcome = yield* steps.client["commit/check"]({ session, start }).pipe(failed("error"));

  if (Predicate.isTagged(outcome, "Changed")) {
    return yield* end(
      "A check changed files. Review the changes and run /commit again.",
      "warning",
    );
  }

  if (Predicate.isTagged(outcome, "Failed")) {
    const names = outcome.names.join(", ");

    return yield* end(`Commit checks failed: ${names}. Nothing was committed.`, "error");
  }

  return outcome;
});

const NO_HASHES: ReadonlyArray<string> = [];

/** Makes the plan's commits and gives their hashes. */
const applied = (steps: Steps, root: string, commits: ReadonlyArray<PlannedCommit>) =>
  steps.client["commit/apply"]({ root, commits }).pipe(
    Stream.runFoldEffect(
      () => NO_HASHES,
      (hashes, event) =>
        Effect.sync(() => {
          if (Predicate.isTagged(event, "Committed")) return event.hashes;
          steps.show(CommitStep.Committing({ index: event.index, count: commits.length }));

          return hashes;
        }),
    ),
    Effect.mapError((error) =>
      Predicate.isTagged(error, "CommitFailed")
        ? end(`${committedText(error.hashes)}, then failed: ${error.message}`, "error")
        : end(error.message, "error"),
    ),
  );

/** Asks before pushing, No first, and pushes when the user says yes. */
const pushed = Effect.fn("commit.pushed")(function* (
  steps: Steps,
  root: string,
  hashes: ReadonlyArray<string>,
) {
  const done = committedText(hashes);

  const target: PushTarget | null = yield* steps.client["commit/push-target"]({ root }).pipe(
    failed("error", `${done}; `),
  );

  if (target === null) return yield* end(`${done}.`, "success");

  steps.show(CommitStep.Push({ target: target.name, count: hashes.length }));
  if (!(yield* steps.ask)) return yield* end(`${done}.`, "success");

  steps.show(CommitStep.Pushing({ target: target.name, count: hashes.length }));

  yield* steps.client["commit/push"]({ root, target }).pipe(
    failed("error", `${done}; push failed: `),
  );

  return yield* end(`${done} and pushed to ${target.name}.`, "success");
});

/** Every step; it always fails with the toast that ends it. */
const commitAll = Effect.fn("commit.all")(function* (
  steps: Steps,
  session: SessionId,
  instruction: string,
) {
  const start = yield* steps.client["commit/start"]().pipe(failed("warning"));
  yield* checked(steps, session, start);
  steps.show(CommitStep.Planning({ model: start.planner }));

  const commits = yield* steps.client["commit/plan"]({ session, start, instruction }).pipe(
    failed("error", "Could not plan commits: "),
  );

  steps.show(CommitStep.Review({ commits }));
  if (!(yield* steps.ask)) return yield* end("Commit cancelled.", "info");

  return yield* pushed(steps, start.root, yield* applied(steps, start.root, commits));
});

/** The flow's state for the dialog, and how the user answers or stops it. */
export interface CommitFlow {
  readonly step: Accessor<CommitStep | undefined>;
  /** Answers the plan or the push question; does nothing while the flow works. */
  readonly answer: (yes: boolean) => void;
  /** Esc: no to a question; stops checks and planning; committing and pushing go on. */
  readonly cancel: () => void;
}

/** The flow's pieces; `finish` gets the toast that ends it. */
export interface FlowDeps {
  readonly client: Client;
  readonly finish: (text: string, kind: ToastKind) => void;
}

/** A flow for one `/commit`, and the Effect that runs it. */
export const makeFlow = (deps: FlowDeps, session: SessionId, instruction: string) => {
  const [step, setStep] = createSignal<CommitStep>();
  const [reply, setReply] = createSignal<(yes: boolean) => void>();
  const stop = Deferred.makeUnsafe<void>();

  const ask = Effect.callback<boolean>((resume) => {
    setReply(() => (yes: boolean) => {
      setReply();
      resume(Effect.succeed(yes));
    });
  });

  const steps: Steps = { client: deps.client, show: (next) => setStep(next), ask };

  const flow: CommitFlow = {
    step,
    answer: (yes) => reply()?.(yes),
    cancel: () => {
      const answering = reply();
      const now = step();

      if (answering !== undefined) answering(false);
      else if (
        now === undefined
        || CommitStep.$is("Checking")(now)
        || CommitStep.$is("Planning")(now)
      ) {
        Deferred.doneUnsafe(stop, Effect.void);
      }
    },
  };

  const stopped = Effect.flatMap(Deferred.await(stop), () =>
    Effect.fail(end("Commit cancelled.", "info")),
  );

  const run = Effect.raceFirst(commitAll(steps, session, instruction), stopped).pipe(
    Effect.catch((ended) =>
      Effect.sync(() => {
        deps.finish(ended.text, ended.kind);
      }),
    ),
  );

  return { flow, run };
};
