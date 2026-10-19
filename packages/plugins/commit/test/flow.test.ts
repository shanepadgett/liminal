/** Input waits follow review and push, not the work between them. */

import { expect } from "bun:test";

import { Effect, Fiber, Layer, Stream } from "effect";
import { RpcTest } from "effect/rpc";

import { SessionId } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";
import { makeTuiInputWaits, type TuiInputWaitsService } from "@liminal/sdk/tui";

import { ChecksPassed, Committed, Committing, CommitRpcs } from "../src/contract.ts";
import { CommitStep, makeFlow } from "../src/tui/flow.ts";

const s1 = SessionId.make("s1");

const active = (waits: TuiInputWaitsService) =>
  Stream.runHead(waits.changes).pipe(Effect.flatMap(Effect.fromOption));

const untilWait = (waits: TuiInputWaitsService, id: string) =>
  waits.changes.pipe(
    Stream.filter((pending) => pending.some((wait) => wait.id === id)),
    Stream.runHead,
  );

const fixture = Effect.fn("fixture")(function* () {
  const waits = yield* makeTuiInputWaits;
  const work: string[] = [];

  const working = Effect.fn("working")(function* (name: string) {
    expect(yield* active(waits).pipe(Effect.orDie)).toEqual([]);
    work.push(name);
  });

  const handlers = yield* CommitRpcs.toHandlers(
    Effect.succeed(
      CommitRpcs.of({
        "commit/start": () =>
          Effect.as(working("start"), {
            root: "/repo",
            checks: 0,
            planner: "scripted/test",
            files: [],
          }),
        "commit/check": () => Effect.as(working("check"), ChecksPassed.make({})),
        "commit/plan": () => Effect.as(working("plan"), [{ message: "fix: example", files: [] }]),
        "commit/apply": () =>
          Stream.concat(
            Stream.fromEffect(Effect.as(working("apply"), Committing.make({ index: 0 }))),
            Stream.make(Committed.make({ hashes: ["abc123"] })),
          ),
        "commit/push-target": () =>
          Effect.as(working("target"), { name: "origin/main", branch: "main", isNew: false }),
        "commit/push": () => working("push"),
      }),
    ),
  );

  const client = yield* RpcTest.makeClient(CommitRpcs).pipe(Effect.provide(handlers));
  const finished: string[] = [];

  const { flow, run } = makeFlow(
    { client, waitForUser: waits.waitForUser, finish: (text) => finished.push(text) },
    s1,
    "",
  );

  return { waits, work, finished, flow, run };
});

effectTest(
  "review and push each request attention and release before work resumes",
  Effect.gen(function* () {
    const { waits, work, finished, flow, run } = yield* fixture();
    const fiber = yield* run.pipe(Effect.forkScoped);
    yield* untilWait(waits, "review");

    expect(flow.step()).toEqual(
      CommitStep.Review({ commits: [{ message: "fix: example", files: [] }] }),
    );

    flow.answer(true);
    yield* untilWait(waits, "push");
    expect(CommitStep.$is("Push")(flow.step())).toBe(true);
    flow.answer(true);
    yield* Fiber.join(fiber);
    expect(work).toEqual(["start", "check", "plan", "apply", "target", "push"]);
    expect(yield* active(waits)).toEqual([]);
    expect(finished).toEqual(["Committed 1 commit (abc123) and pushed to origin/main."]);
  }),
  Layer.empty,
);

effectTest(
  "Esc at review releases the wait without committing",
  Effect.gen(function* () {
    const { waits, work, finished, flow, run } = yield* fixture();
    const fiber = yield* run.pipe(Effect.forkScoped);
    yield* untilWait(waits, "review");
    flow.cancel();
    yield* Fiber.join(fiber);
    expect(work).toEqual(["start", "check", "plan"]);
    expect(yield* active(waits)).toEqual([]);
    expect(finished).toEqual(["Commit cancelled."]);
  }),
  Layer.empty,
);

effectTest(
  "No at push releases the wait without pushing",
  Effect.gen(function* () {
    const { waits, work, flow, run } = yield* fixture();
    const fiber = yield* run.pipe(Effect.forkScoped);
    yield* untilWait(waits, "review");
    flow.answer(true);
    yield* untilWait(waits, "push");
    flow.answer(false);
    yield* Fiber.join(fiber);
    expect(work).toEqual(["start", "check", "plan", "apply", "target"]);
    expect(yield* active(waits)).toEqual([]);
  }),
  Layer.empty,
);

effectTest(
  "unloading a flow releases its wait and disables its answer callback",
  Effect.gen(function* () {
    const { waits, work, finished, flow, run } = yield* fixture();
    const fiber = yield* run.pipe(Effect.forkScoped);
    yield* untilWait(waits, "review");
    yield* Fiber.interrupt(fiber);
    flow.answer(true);
    flow.cancel();
    expect(yield* active(waits)).toEqual([]);
    expect(work).toEqual(["start", "check", "plan"]);
    expect(finished).toEqual([]);
  }),
  Layer.empty,
);
