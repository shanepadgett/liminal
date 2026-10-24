/** How big a session's context is, and the sizes memory works to. */
import { Number as Num, Option } from "effect";

import type { SessionEvent } from "@shanepadgett/liminal-session/contract";

import type { NudgeLevel } from "./contract.ts";
import type { Scan } from "./scan.ts";

/** Sizes are estimated at this many characters a token. */
const CHARS_PER_TOKEN = 4;

/** A memory sums up about this many tokens of entries. */
export const RANGE = 15_000;

/** Memories past this many tokens are compacted. */
export const COMPACT_AT = 30_000;

/** The newest memories, up to this many tokens, stay out of a compaction. */
export const KEEP_OUT = 8_000;

/** A compacted memory longer than this is written again, more strictly, once. */
export const COMPACT_MAX = 8_000;

/** At most this many tokens of files are read back at a checkpoint. */
export const FILES_MAX = 30_000;

/** Room each threshold leaves below the context window. */
const RESERVE = 16_000;

/** The context sizes at which the model is nudged, highest last. */
const THRESHOLDS: ReadonlyArray<readonly [NudgeLevel, number]> = [
  ["consider", 150_000],
  ["soon", 200_000],
  ["full", 250_000],
];

const LEVELS: ReadonlyArray<NudgeLevel> = THRESHOLDS.map(([level]) => level);

export const estimate = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

export const estimateEvents = (events: ReadonlyArray<SessionEvent>) =>
  Num.sumAll(events.map((event) => estimate(JSON.stringify(event.data))));

export const estimateTexts = (texts: ReadonlyArray<string>) => Num.sumAll(texts.map(estimate));

/**
 * The context's size: the latest step's tokens plus what was logged since, or an estimate of what
 * the latest checkpoint left when no step has run since.
 */
export const sizeOf = (scanned: Scan) =>
  Option.match(scanned.lastStep, {
    onNone: () => estimateTexts(scanned.carried) + estimateEvents(scanned.context),
    onSome: ({ tokens }) => tokens + estimateEvents(scanned.since),
  });

export type Limits = ReadonlyArray<readonly [NudgeLevel, number]>;

/** The thresholds, each at most the window less the reserve; uncapped when the window is unknown. */
export const limitsOf = (window: number | undefined): Limits =>
  THRESHOLDS.map(([level, at]) => [
    level,
    window === undefined ? at : Math.min(at, window - RESERVE),
  ]);

/** The size at which the model is first nudged. */
export const considerAt = (limits: Limits) => limits[0]?.[1] ?? Number.POSITIVE_INFINITY;

/** The highest level `size` passes. */
export const levelOf = (size: number, limits: Limits): Option.Option<NudgeLevel> =>
  Option.fromNullishOr(limits.findLast(([, at]) => size > at)?.[0]);

/** Whether `level` is above `previous`, or there is no previous. */
export const isAbove = (level: NudgeLevel, previous: Option.Option<NudgeLevel>) =>
  Option.match(previous, {
    onNone: () => true,
    onSome: (before) => LEVELS.indexOf(level) > LEVELS.indexOf(before),
  });
