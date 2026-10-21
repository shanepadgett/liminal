/** The reload machine's transitions, step by step, with no processes or graphs. */

import { describe, expect, test } from "bun:test";

import { Context, Deferred, Option, Scope } from "effect";

import type { Candidate } from "../src/graph/graphs.ts";
import { Change } from "../src/reload/changes.ts";
import {
  Command,
  Event,
  initialState,
  Phase,
  type State,
  type Step,
  transition,
} from "../src/reload/machine.ts";

const plugins = (...packages: ReadonlyArray<string>) =>
  Change.Plugins({ packages: new Set(packages) });

/** A stand-in candidate; the machine only passes candidates along. */
const candidate = (label: string): Candidate => {
  const graph = {
    status: [],
    services: Context.empty(),
    rpcs: [],
    builds: [],
    providers: new Map([["label", label]]),
    packages: [],
  };

  return {
    graph,
    base: { ...graph, scope: Scope.makeUnsafe(), closed: Deferred.makeUnsafe() },
    fresh: { builds: [], packages: [] },
  };
};

/** Runs `events` from `state`, returning the last step. */
const run = (state: State, ...events: ReadonlyArray<Event>): Step => {
  let step: Step = [state, []];
  for (const event of events) step = transition(step[0], event);

  return step;
};

const passed = (check: number, isAutomatic: boolean, made = Option.none<Candidate>()) =>
  Event.Passed({ check, candidate: made, isAutomatic });

describe("reload machine", () => {
  test("a change starts a check", () => {
    const [state, commands] = run(initialState, Event.Changed({ change: plugins("a") }));

    expect(state.phase).toEqual(Phase.Checking({ change: plugins("a"), check: 1 }));
    expect(commands).toEqual([Command.Check({ change: plugins("a"), check: 1 })]);
  });

  test("a change during a check restarts it with both changes", () => {
    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.Changed({ change: plugins("b") }),
    );

    expect(state.phase).toEqual(Phase.Checking({ change: plugins("a", "b"), check: 2 }));
    expect(commands).toEqual([Command.Check({ change: plugins("a", "b"), check: 2 })]);
  });

  test("a restart wins over plugin changes", () => {
    const [state] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.Changed({ change: Change.Restart() }),
    );

    expect(state.phase).toEqual(Phase.Checking({ change: Change.Restart(), check: 2 }));
  });

  test("a pass in automatic mode applies at once", () => {
    const made = Option.some(candidate("one"));

    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, true, made),
    );

    expect(state.phase).toEqual(Phase.Applying({ pending: Option.none() }));
    expect(commands).toEqual([Command.Apply({ candidate: made })]);
  });

  test("a pass in confirmed mode waits for the reload command", () => {
    const made = Option.some(candidate("one"));

    const ready = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, false, made),
    );

    expect(ready[0].phase).toEqual(Phase.Ready({ change: plugins("a"), candidate: made }));
    expect(ready[1]).toEqual([]);

    const [state, commands] = transition(ready[0], Event.Requested());
    expect(state.phase).toEqual(Phase.Applying({ pending: Option.none() }));
    expect(commands).toEqual([Command.Apply({ candidate: made })]);
  });

  test("a change while ready discards the candidate and checks both changes", () => {
    const made = candidate("one");

    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, false, Option.some(made)),
      Event.Changed({ change: plugins("b") }),
    );

    expect(state.phase).toEqual(Phase.Checking({ change: plugins("a", "b"), check: 2 }));

    expect(commands).toEqual([
      Command.Discard({ candidate: made }),
      Command.Check({ change: plugins("a", "b"), check: 2 }),
    ]);
  });

  test("a replaced check's pass discards its candidate", () => {
    const made = candidate("old");

    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.Changed({ change: plugins("b") }),
      passed(1, true, Option.some(made)),
    );

    expect(state.phase).toEqual(Phase.Checking({ change: plugins("a", "b"), check: 2 }));
    expect(commands).toEqual([Command.Discard({ candidate: made })]);
  });

  test("a failure keeps the change for the next check", () => {
    const [failed] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.CheckFailed({ check: 1, reason: "broken" }),
    );

    expect(failed.phase).toEqual(Phase.Failed({ change: plugins("a"), reason: "broken" }));
    const [state] = transition(failed, Event.Changed({ change: plugins("b") }));
    expect(state.phase).toEqual(Phase.Checking({ change: plugins("a", "b"), check: 2 }));
  });

  test("a change while applying waits, then checks once applied", () => {
    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, true, Option.some(candidate("one"))),
      Event.Changed({ change: plugins("b") }),
      Event.Applied(),
    );

    expect(state.phase).toEqual(Phase.Checking({ change: plugins("b"), check: 2 }));
    expect(commands).toEqual([Command.Check({ change: plugins("b"), check: 2 })]);
  });

  test("an applied change with nothing pending is current", () => {
    const [state] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, true, Option.some(candidate("one"))),
      Event.Applied(),
    );

    expect(state.phase).toEqual(Phase.Current());
  });

  test("a change while a turn runs waits instead of checking", () => {
    const [state, commands] = run(
      initialState,
      Event.BusyChanged({ isBusy: true }),
      Event.Changed({ change: plugins("a") }),
      Event.Changed({ change: plugins("b") }),
    );

    expect(state.phase).toEqual(Phase.Waiting({ change: plugins("a", "b") }));
    expect(commands).toEqual([]);
  });

  test("the last turn ending checks the change that waited", () => {
    const [state, commands] = run(
      initialState,
      Event.BusyChanged({ isBusy: true }),
      Event.Changed({ change: plugins("a") }),
      Event.BusyChanged({ isBusy: false }),
    );

    expect(state.phase).toEqual(Phase.Checking({ change: plugins("a"), check: 1 }));
    expect(commands).toEqual([Command.Check({ change: plugins("a"), check: 1 })]);
  });

  test("a change during a check and a turn stops the check and waits", () => {
    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.BusyChanged({ isBusy: true }),
      Event.Changed({ change: plugins("b") }),
    );

    expect(state.phase).toEqual(Phase.Waiting({ change: plugins("a", "b") }));
    expect(commands).toEqual([Command.StopCheck()]);
  });

  test("the result of a check stopped for a turn is dropped", () => {
    const made = candidate("old");

    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.BusyChanged({ isBusy: true }),
      Event.Changed({ change: plugins("b") }),
      passed(1, true, Option.some(made)),
    );

    expect(state.phase).toEqual(Phase.Waiting({ change: plugins("a", "b") }));
    expect(commands).toEqual([Command.Discard({ candidate: made })]);
  });

  test("a change while ready and a turn runs discards the candidate and waits", () => {
    const made = candidate("one");

    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, false, Option.some(made)),
      Event.BusyChanged({ isBusy: true }),
      Event.Changed({ change: plugins("b") }),
    );

    expect(state.phase).toEqual(Phase.Waiting({ change: plugins("a", "b") }));
    expect(commands).toEqual([Command.Discard({ candidate: made })]);
  });

  test("a change after a failure while a turn runs hides the failure", () => {
    const [state] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      Event.CheckFailed({ check: 1, reason: "broken" }),
      Event.BusyChanged({ isBusy: true }),
      Event.Changed({ change: plugins("b") }),
    );

    expect(state.phase).toEqual(Phase.Waiting({ change: plugins("a", "b") }));
  });

  test("a change pending when an apply ends waits while a turn runs", () => {
    const [state, commands] = run(
      initialState,
      Event.Changed({ change: plugins("a") }),
      passed(1, true, Option.some(candidate("one"))),
      Event.Changed({ change: plugins("b") }),
      Event.BusyChanged({ isBusy: true }),
      Event.Applied(),
    );

    expect(state.phase).toEqual(Phase.Waiting({ change: plugins("b") }));
    expect(commands).toEqual([]);
  });

  test("the reload command does nothing unless ready", () => {
    expect(transition(initialState, Event.Requested())).toEqual([initialState, []]);
  });
});
