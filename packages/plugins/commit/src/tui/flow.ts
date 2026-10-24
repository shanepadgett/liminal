/**
 * `/commit` in the TUI: runs the server's steps in order, from planning to the push question, and
 * keeps the step the ask shows. Each ending is one notification.
 */
import { Data, Deferred, Effect, Predicate, Schema, Stream } from "effect";
import type { RpcClient, RpcClientError, RpcGroup } from "effect/rpc";
import { type Accessor, createSignal } from "solid-js";

import type { ModelId } from "@shanepadgett/liminal-model/contract";
import type { Notification, NotificationKind } from "@shanepadgett/liminal-tui";

import {
  commitsText,
  type CommitRpc,
  type CommitStart,
  type PlannedCommit,
  type PushTarget,
} from "../contract.ts";

/** What the ask shows; `Review` and `Push` wait for the user. */
export type CommitStep = Data.TaggedEnum<{
  Planning: { readonly files: number; readonly model: string };
  Review: { readonly commits: ReadonlyArray<PlannedCommit> };
  Committing: {
    readonly commits: ReadonlyArray<PlannedCommit>;
    /** The short hashes of the commits made so far, in order. */
    readonly hashes: ReadonlyArray<string>;
  };
  Push: { readonly target: string; readonly count: number };
  Pushing: { readonly target: string; readonly count: number };
}>;

export const CommitStep = Data.taggedEnum<CommitStep>();

/** The flow is over; the notification says how. */
class Ended extends Schema.TaggedError<Ended, { readonly brand: unique symbol }>()("Ended", {
  kind: Schema.Literals(["info", "success", "warning", "error"]),
  title: Schema.String,
  /** Empty when the title says it all. */
  message: Schema.String,
}) {}

const end = (kind: NotificationKind, title: string, message = "") =>
  new Ended({ kind, title, message });

const failed = (kind: NotificationKind, title: string) =>
  Effect.mapError((error: { readonly message: string }) => end(kind, title, error.message));

type Client = RpcClient.RpcClient<RpcGroup.Rpcs<typeof CommitRpc>, RpcClientError.RpcClientError>;

/** What the steps drive: the server, how to show a step, and how to wait for an answer. */
interface Steps {
  readonly client: Client;
  readonly show: (step: CommitStep) => void;
  /** Waits for the user's answer to the step on screen. */
  readonly ask: Effect.Effect<boolean>;
}

const committedText = (hashes: ReadonlyArray<string>) =>
  hashes.length === 0 ? "Committed nothing" : `Committed ${commitsText(hashes.length)}`;

const NO_HASHES: ReadonlyArray<string> = [];

/** Makes the plan's commits and gives their hashes. */
const applied = (steps: Steps, root: string, commits: ReadonlyArray<PlannedCommit>) =>
  steps.client["commit/apply"]({ root, commits }).pipe(
    Stream.runFoldEffect(
      () => NO_HASHES,
      (hashes, event) =>
        Effect.sync(() => {
          if (Predicate.isTagged(event, "Committed")) return event.hashes;
          steps.show(CommitStep.Committing({ commits, hashes }));

          return hashes;
        }),
    ),
    Effect.mapError((error) =>
      Predicate.isTagged(error, "CommitFailed")
        ? end("error", `${committedText(error.hashes)}, then a commit failed`, error.message)
        : end("error", "Commit failed", error.message),
    ),
  );

/** Pushes as the `push` setting says: never, always, or after asking with No first. */
const pushed = Effect.fn("commit.pushed")(function* (
  steps: Steps,
  start: CommitStart,
  hashes: ReadonlyArray<string>,
) {
  const { root, push } = start;
  const done = committedText(hashes);
  const list = hashes.join(", ");
  if (push === "never") return yield* end("success", done, list);

  const target: PushTarget | null = yield* steps.client["commit/push-target"]({ root }).pipe(
    failed("error", `${done}; no push`),
  );

  if (target === null) return yield* end("success", done, list);

  if (push === "ask") {
    steps.show(CommitStep.Push({ target: target.name, count: hashes.length }));
    if (!(yield* steps.ask)) return yield* end("success", done, list);
  }

  steps.show(CommitStep.Pushing({ target: target.name, count: hashes.length }));

  yield* steps.client["commit/push"]({ root, target }).pipe(
    failed("error", `${done}; push failed`),
  );

  return yield* end("success", `${done} and pushed to ${target.name}`, list);
});

/** Every step; it always fails with the notification that ends it. */
/** What `/commit` ran with: the text after it, and the model selected on screen. */
export interface CommitRequest {
  readonly instruction: string;
  readonly main: ModelId | undefined;
}

const commitAll = Effect.fn("commit.all")(function* (steps: Steps, request: CommitRequest) {
  const start = yield* steps.client["commit/start"]({ main: request.main }).pipe(
    failed("warning", "Nothing committed"),
  );

  steps.show(CommitStep.Planning({ files: start.files.length, model: start.planner }));

  const commits = yield* steps.client["commit/plan"]({
    start,
    instruction: request.instruction,
  }).pipe(failed("error", "Could not plan commits"));

  steps.show(CommitStep.Review({ commits }));
  if (!(yield* steps.ask)) return yield* end("info", "Commit cancelled");

  return yield* pushed(steps, start, yield* applied(steps, start.root, commits));
});

/** The flow's state for the ask, and how the user answers or stops it. */
export interface CommitFlow {
  readonly step: Accessor<CommitStep | undefined>;
  /** Answers the plan or the push question; does nothing while the flow works. */
  readonly answer: (yes: boolean) => void;
  /** Esc: no to a question; stops planning; committing and pushing go on. */
  readonly cancel: () => void;
}

/** A flow for one `/commit`, and the Effect that runs it against the server. */
export const makeFlow = (request: CommitRequest, finish: (notification: Notification) => void) => {
  const [step, setStep] = createSignal<CommitStep>();
  const [reply, setReply] = createSignal<(yes: boolean) => void>();
  const stop = Deferred.makeUnsafe<void>();

  const ask = Effect.gen(function* () {
    const answer = yield* Deferred.make<boolean>();

    yield* Effect.acquireRelease(
      Effect.sync(() =>
        setReply(() => (yes: boolean) => {
          setReply();
          Deferred.doneUnsafe(answer, Effect.succeed(yes));
        }),
      ),
      () =>
        Effect.sync(() => {
          setReply();
        }),
    );

    return yield* Deferred.await(answer);
  }).pipe(Effect.scoped);

  const flow: CommitFlow = {
    step,
    answer: (yes) => reply()?.(yes),
    cancel: () => {
      const answering = reply();
      const now = step();

      if (answering !== undefined) answering(false);
      else if (now === undefined || CommitStep.$is("Planning")(now)) {
        Deferred.doneUnsafe(stop, Effect.void);
      }
    },
  };

  const stopped = Effect.flatMap(Deferred.await(stop), () =>
    Effect.fail(end("info", "Commit cancelled")),
  );

  const run = (client: Client) =>
    Effect.raceFirst(
      commitAll({ client, show: (next) => setStep(next), ask }, request),
      stopped,
    ).pipe(
      Effect.catch((ended) =>
        Effect.sync(() => {
          finish(
            ended.message === ""
              ? { kind: ended.kind, title: ended.title }
              : { kind: ended.kind, title: ended.title, message: ended.message },
          );
        }),
      ),
    );

  return { flow, run };
};
