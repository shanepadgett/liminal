/**
 * A turn's frame at any moment of its script, worked out from the script alone, so playback, a
 * paused moment and a test all see the same turn. A turn that closes with an answer inks in how
 * long it worked as soon as the work is over, then streams the answer. A turn that closes with
 * questions drafts the form as the last of its work, then inks in how long it worked.
 */

import { Match } from "effect";

import type { Block, Ending, Final, Streaming, Tip, TurnFrame } from "./frame.ts";
import type { Action, Beat, Close, Script } from "./script.ts";
import { type WorkGroup, groupsOf, type Work, withLive } from "./workGroups.ts";

/** How long the worked line takes to ink in once the work is over, before the answer starts. */
export const SETTLE_MS = 900;

/** How long work takes to dim once the assistant speaks after it, or once the turn's work is over. */
export const DIM_MS = 600;

/** Between turns, the time the user takes offstage to write the next prompt or answer questions. */
export const BETWEEN_TURNS_MS = 2600;

type Timed = { readonly beat: Beat; readonly start: number; readonly end: number };

const timedBeats = (beats: readonly Beat[]): readonly Timed[] => {
  const timed: Timed[] = [];
  let start = 0;

  for (const beat of beats) {
    timed.push({ beat, start, end: start + beat.ms });
    start += beat.ms;
  }

  return timed;
};

const workMsOf = (script: Script) => timedBeats(script.beats).at(-1)?.end ?? 0;

/** When the work is over and the worked line inks in: after drafting, for a form of questions. */
const endsAt = (script: Script) =>
  workMsOf(script) + (script.close.kind === "questions" ? script.close.ms : 0);

export const durationOf = (script: Script) => workMsOf(script) + SETTLE_MS + script.close.ms;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const streamed = (text: string, progress: number): Streaming => ({
  text,
  progress: clamp01(progress),
});

/** What has settled so far: what was said and when it started, and the work done between. */
type Settled =
  | ({ readonly kind: "said"; readonly start: number } & Streaming)
  | { readonly kind: "work"; readonly work: readonly Work[] };

/** The settled list with one more piece of work, on the last stretch of work or a new one. */
const withWork = (settled: readonly Settled[], work: Work): readonly Settled[] => {
  const last = settled.at(-1);
  if (last?.kind !== "work") return [...settled, { kind: "work", work: [work] }];

  return [...settled.slice(0, -1), { kind: "work", work: [...last.work, work] }];
};

const settledOf = (finished: readonly Timed[]): readonly Settled[] => {
  let settled: readonly Settled[] = [];

  for (const { beat, start } of finished) {
    settled = Match.value(beat).pipe(
      Match.discriminatorsExhaustive("kind")({
        think: (think) =>
          withWork(settled, { kind: "thought", text: think.text, seconds: think.ms / 1000 }),
        act: (act) => withWork(settled, { kind: "action", action: act.action }),
        say: (say): readonly Settled[] => [
          ...settled,
          { kind: "said", text: say.text, progress: 1, start },
        ],
      }),
    );
  }

  return settled;
};

/** What the assistant is saying now, if anything, as far as it has got. */
const speakingOf = (current: Timed | undefined, ms: number): readonly Settled[] => {
  if (current?.beat.kind !== "say") return [];

  const progress = (ms - current.start) / current.beat.ms;

  return [{ kind: "said", ...streamed(current.beat.text, progress), start: current.start }];
};

/** When the work at `index` starts to dim: once the assistant next speaks, or once the work ends. */
const dimsAtOf = (settled: readonly Settled[], index: number, endMs: number) => {
  const next = settled.slice(index + 1).find((each) => each.kind === "said");

  return next?.kind === "said" ? next.start : endMs;
};

/** The blocks to draw, each stretch of work as dim as the time since it was left behind. */
const blocksOf = (settled: readonly Settled[], ms: number, endMs: number): readonly Block[] =>
  settled.map((each, index): Block => {
    if (each.kind === "said") return { kind: "said", text: each.text, progress: each.progress };

    const dim = clamp01((ms - dimsAtOf(settled, index, endMs)) / DIM_MS);

    return { kind: "work", groups: groupsOf(each.work), dim };
  });

/**
 * The blocks with the action going on now joined to the work before it, and the group it is part of
 * taken out to show on the live line. The work it carries on is current, so it is not dim.
 */
const withLiveGroup = (
  settled: readonly Settled[],
  action: Action,
  ms: number,
  endMs: number,
): { readonly blocks: readonly Block[]; readonly group: WorkGroup } => {
  const last = settled.at(-1);
  const isWorking = last?.kind === "work";
  const before = blocksOf(isWorking ? settled.slice(0, -1) : settled, ms, endMs);

  const { settled: groups, live } = withLive(isWorking ? last.work : [], {
    kind: "action",
    action,
  });

  return {
    blocks: groups.length === 0 ? before : [...before, { kind: "work", groups, dim: 0 }],
    group: live,
  };
};

const tipOf = (current: Timed | undefined, ms: number, group: WorkGroup | undefined): Tip => {
  if (current === undefined) return { kind: "quiet" };

  const progress = (ms - current.start) / current.beat.ms;
  const seconds = (ms - current.start) / 1000;

  return Match.value(current.beat).pipe(
    Match.discriminatorsExhaustive("kind")({
      think: (think): Tip => ({ kind: "thinking", seconds, ...streamed(think.text, progress) }),
      act: (act): Tip =>
        group === undefined
          ? { kind: "quiet" }
          : { kind: "acting", group, action: act.action, progress, seconds },
      say: (): Tip => ({ kind: "quiet" }),
    }),
  );
};

const finalOf = (close: Close, sinceSettled: number): Final =>
  close.kind === "answer"
    ? { kind: "answer", answer: streamed(close.text, sinceSettled / close.ms) }
    : { kind: "questions", title: close.title, count: close.questions.length };

const endingOf = (script: Script, ms: number): Ending | undefined => {
  const endMs = endsAt(script);
  if (ms < endMs) return undefined;

  return {
    seconds: endMs / 1000,
    drawn: clamp01((ms - endMs) / SETTLE_MS),
    final: finalOf(script.close, ms - endMs - SETTLE_MS),
  };
};

/** The tip once the beats are over: the form being drafted, if the turn closes with one. */
const closingTipOf = (script: Script, ms: number): Tip => {
  const workMs = workMsOf(script);
  const { close } = script;

  if (close.kind === "answer" || ms >= workMs + close.ms) return { kind: "quiet" };

  return { kind: "drafting", seconds: (ms - workMs) / 1000 };
};

export const frameAt = (script: Script, ms: number): TurnFrame => {
  const timed = timedBeats(script.beats);
  const finished = timed.filter((each) => each.end <= ms);
  const current = timed.find((each) => each.start <= ms && ms < each.end);
  const settled = [...settledOf(finished), ...speakingOf(current, ms)];
  const endMs = endsAt(script);

  const live =
    current?.beat.kind === "act"
      ? withLiveGroup(settled, current.beat.action, ms, endMs)
      : undefined;

  return {
    ms,
    blocks: live?.blocks ?? blocksOf(settled, ms, endMs),
    tip: current === undefined ? closingTipOf(script, ms) : tipOf(current, ms, live?.group),
    ending: endingOf(script, ms),
  };
};

/** The moment `fraction` of the way through the `index`th beat, for showing one moment of a turn. */
export const momentOf = (script: Script, index: number, fraction: number): number => {
  const beat = timedBeats(script.beats)[index];
  if (beat === undefined) return durationOf(script);

  return beat.start + fraction * beat.beat.ms;
};

/** The moment `fraction` of the way through the close: streaming the answer, or drafting the form. */
export const closeMomentOf = (script: Script, fraction: number): number => {
  const settle = script.close.kind === "answer" ? SETTLE_MS : 0;

  return workMsOf(script) + settle + fraction * script.close.ms;
};

/** A turn of a session that has begun, and how far into it the session is. */
export type TurnAt = { readonly script: Script; readonly ms: number };

/** The turns of a session played one after another that have begun by `ms`. */
export const turnsAt = (scripts: readonly Script[], ms: number): readonly TurnAt[] => {
  const turns: TurnAt[] = [];
  let start = 0;

  for (const script of scripts) {
    if (ms < start) break;
    turns.push({ script, ms: Math.min(ms - start, durationOf(script)) });
    start += durationOf(script) + BETWEEN_TURNS_MS;
  }

  return turns;
};

/** How long a session takes to play, from the first prompt to the end of the last turn. */
export const sessionDurationOf = (scripts: readonly Script[]): number => {
  let total = BETWEEN_TURNS_MS * Math.max(0, scripts.length - 1);
  for (const script of scripts) total += durationOf(script);

  return total;
};
