/**
 * The reload state machine: a pure step from a state and an event to the next state and the
 * commands the runner carries out, as Tau's supervisor restart machine.
 */

import { Data, Option } from "effect";

import type { Candidate } from "../graph/graphs.ts";
import { type Change, merge } from "./changes.ts";

export type Phase = Data.TaggedEnum<{
  /** The running code is the newest checked code. */
  Current: {};
  /** Check `check` runs for `change`. */
  Checking: { readonly change: Change; readonly check: number };
  /** The change passed; a plugin change carries its candidate graph, a restart none. */
  Ready: { readonly change: Change; readonly candidate: Option.Option<Candidate> };
  /** The change failed its check; the next change is checked together with it. */
  Failed: { readonly change: Change; readonly reason: string };
  /** The change applies once no turn runs; `pending` changed meanwhile. */
  Applying: { readonly pending: Option.Option<Change> };
}>;

export const Phase = Data.taggedEnum<Phase>();

export interface State {
  readonly phase: Phase;
  /** Numbers each check, so the result of a check a newer one replaced is dropped. */
  readonly lastCheck: number;
}

export type Event = Data.TaggedEnum<{
  Changed: { readonly change: Change };
  Passed: {
    readonly check: number;
    readonly candidate: Option.Option<Candidate>;
    readonly isAutomatic: boolean;
  };
  CheckFailed: { readonly check: number; readonly reason: string };
  /** The reload command. */
  Requested: {};
  /** A plugin change applied; a restart never reports back. */
  Applied: {};
}>;

export const Event = Data.taggedEnum<Event>();

export type Command = Data.TaggedEnum<{
  /** Starts check `check`, stopping any check still running. */
  Check: { readonly change: Change; readonly check: number };
  /** Closes a candidate that will not apply. */
  Discard: { readonly candidate: Candidate };
  /** Applies the change once no turn runs: commits the candidate, or restarts without one. */
  Apply: { readonly candidate: Option.Option<Candidate> };
}>;

export const Command = Data.taggedEnum<Command>();

export const initialState: State = { phase: Phase.Current(), lastCheck: 0 };

export type Step = readonly [State, ReadonlyArray<Command>];

const startCheck = (state: State, change: Change, first: ReadonlyArray<Command> = []): Step => {
  const check = state.lastCheck + 1;

  return [
    { phase: Phase.Checking({ change, check }), lastCheck: check },
    [...first, Command.Check({ change, check })],
  ];
};

const apply = (state: State, candidate: Option.Option<Candidate>): Step => [
  { ...state, phase: Phase.Applying({ pending: Option.none() }) },
  [Command.Apply({ candidate })],
];

const discard = (candidate: Option.Option<Candidate>): ReadonlyArray<Command> =>
  Option.isSome(candidate) ? [Command.Discard({ candidate: candidate.value })] : [];

const withPending = (pending: Option.Option<Change>, change: Change) =>
  Option.some(Option.isSome(pending) ? merge(pending.value, change) : change);

/** A change is checked at once, together with any change not yet applied. */
const onChanged = (state: State, change: Change): Step =>
  Phase.$match(state.phase, {
    Current: () => startCheck(state, change),
    Checking: (running) => startCheck(state, merge(running.change, change)),
    Ready: (ready) => startCheck(state, merge(ready.change, change), discard(ready.candidate)),
    Failed: (failed) => startCheck(state, merge(failed.change, change)),
    Applying: ({ pending }): Step => [
      { ...state, phase: Phase.Applying({ pending: withPending(pending, change) }) },
      [],
    ],
  });

/** The check that runs now, if `check` is it. */
const runningCheck = (state: State, check: number) =>
  Phase.$is("Checking")(state.phase) && state.phase.check === check
    ? Option.some(state.phase)
    : Option.none();

/** A passed check applies at once in automatic mode; a replaced check's candidate is closed. */
const onPassed = (state: State, passed: Extract<Event, { readonly _tag: "Passed" }>): Step => {
  const running = runningCheck(state, passed.check);
  if (Option.isNone(running)) return [state, discard(passed.candidate)];
  if (passed.isAutomatic) return apply(state, passed.candidate);

  const phase = Phase.Ready({ change: running.value.change, candidate: passed.candidate });

  return [{ ...state, phase }, []];
};

const onCheckFailed = (state: State, check: number, reason: string): Step => {
  const running = runningCheck(state, check);
  if (Option.isNone(running)) return [state, []];

  return [{ ...state, phase: Phase.Failed({ change: running.value.change, reason }) }, []];
};

const onApplied = (state: State): Step => {
  if (!Phase.$is("Applying")(state.phase)) return [state, []];
  const { pending } = state.phase;

  return Option.isSome(pending)
    ? startCheck(state, pending.value)
    : [{ ...state, phase: Phase.Current() }, []];
};

/** The next state and the commands to carry out. */
export const transition = (state: State, event: Event): Step =>
  Event.$match(event, {
    Changed: ({ change }) => onChanged(state, change),
    Passed: (passed) => onPassed(state, passed),
    CheckFailed: ({ check, reason }) => onCheckFailed(state, check, reason),
    Requested: (): Step =>
      Phase.$is("Ready")(state.phase) ? apply(state, state.phase.candidate) : [state, []],
    Applied: () => onApplied(state),
  });
