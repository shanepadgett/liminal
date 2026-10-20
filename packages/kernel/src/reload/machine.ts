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
  /** The change waits for no turn to run, so no check runs on code a turn is still editing. */
  Waiting: { readonly change: Change };
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
  /** Whether any turn runs. */
  readonly isBusy: boolean;
}

export type Event = Data.TaggedEnum<{
  Changed: { readonly change: Change };
  Passed: {
    readonly check: number;
    readonly candidate: Option.Option<Candidate>;
    readonly isAutomatic: boolean;
  };
  CheckFailed: { readonly check: number; readonly reason: string };
  /** A turn started while none ran, or the last running turn ended. */
  BusyChanged: { readonly isBusy: boolean };
  /** The reload command. */
  Requested: {};
  /** A plugin change applied; a restart never reports back. */
  Applied: {};
}>;

export const Event = Data.taggedEnum<Event>();

export type Command = Data.TaggedEnum<{
  /** Starts check `check`, stopping any check still running. */
  Check: { readonly change: Change; readonly check: number };
  /** Stops the check that runs, whose result no one reads. */
  StopCheck: {};
  /** Closes a candidate that will not apply. */
  Discard: { readonly candidate: Candidate };
  /** Applies the change once no turn runs: commits the candidate, or restarts without one. */
  Apply: { readonly candidate: Option.Option<Candidate> };
}>;

export const Command = Data.taggedEnum<Command>();

export const initialState: State = { phase: Phase.Current(), lastCheck: 0, isBusy: false };

export type Step = readonly [State, ReadonlyArray<Command>];

const startCheck = (state: State, change: Change, first: ReadonlyArray<Command> = []): Step => {
  const check = state.lastCheck + 1;

  return [
    { ...state, phase: Phase.Checking({ change, check }), lastCheck: check },
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

const wait = (state: State, change: Change, first: ReadonlyArray<Command>): Step => [
  { ...state, phase: Phase.Waiting({ change }) },
  first,
];

/** A turn may still be editing the code, so while one runs the change waits instead of checking. */
const schedule = (state: State, change: Change, first: ReadonlyArray<Command> = []): Step =>
  state.isBusy ? wait(state, change, first) : startCheck(state, change, first);

/** A change is checked, together with any change not yet applied, once no turn runs. */
const onChanged = (state: State, change: Change): Step =>
  Phase.$match(state.phase, {
    Current: () => schedule(state, change),
    Checking: (running) =>
      schedule(state, merge(running.change, change), state.isBusy ? [Command.StopCheck()] : []),
    Waiting: (waiting) => schedule(state, merge(waiting.change, change)),
    Ready: (ready) => schedule(state, merge(ready.change, change), discard(ready.candidate)),
    Failed: (failed) => schedule(state, merge(failed.change, change)),
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
    ? schedule(state, pending.value)
    : [{ ...state, phase: Phase.Current() }, []];
};

/** The last running turn ending starts the check of a change that waited. */
const onBusyChanged = (state: State, isBusy: boolean): Step => {
  const next = { ...state, isBusy };

  return !isBusy && Phase.$is("Waiting")(state.phase)
    ? startCheck(next, state.phase.change)
    : [next, []];
};

/** The next state and the commands to carry out. */
export const transition = (state: State, event: Event): Step =>
  Event.$match(event, {
    Changed: ({ change }) => onChanged(state, change),
    Passed: (passed) => onPassed(state, passed),
    CheckFailed: ({ check, reason }) => onCheckFailed(state, check, reason),
    BusyChanged: ({ isBusy }) => onBusyChanged(state, isBusy),
    Requested: (): Step =>
      Phase.$is("Ready")(state.phase) ? apply(state, state.phase.candidate) : [state, []],
    Applied: () => onApplied(state),
  });
