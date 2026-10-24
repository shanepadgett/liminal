/**
 * Porter shows a turn is working: a little face thinking to itself, glancing about and blinking at
 * uneven moments, beside a murmur of words. Each word scrambles into place letter by letter,
 * shimmers and flickers while it holds, then scrambles away for the next. A caller can give him
 * other words and faces; when they change, the next word and face come at once.
 */

import { useTimeline } from "@opentui/solid";
import { type Accessor, createMemo, createSignal, For } from "solid-js";

import { mixHex } from "../theme/oklch.ts";
import { useColor } from "../theme/theme.tsx";
import { cellsOf } from "./Gradient.tsx";

const FRAME_MILLISECONDS = 60;

/** The timeline loops after this many frames, well over an hour. */
const LOOP_FRAMES = 100_000;

/** A whole number from `low` to `high`, both included. */
const between = (low: number, high: number) => low + Math.floor(Math.random() * (high - low + 1));

/** A frame counter driven by OpenTUI's timeline. */
const useFrame = () => {
  const [frame, setFrame] = createSignal(0);
  const timeline = useTimeline({ duration: LOOP_FRAMES * FRAME_MILLISECONDS, loop: true });

  // The timeline moves `clock.at` itself; each update copies it into the signal.
  const clock = { at: 0 };

  timeline.add(clock, {
    at: LOOP_FRAMES,
    duration: LOOP_FRAMES * FRAME_MILLISECONDS,
    onUpdate: () => {
      setFrame(Math.floor(clock.at));
    },
  });

  return frame;
};

/** One face Porter makes. */
export interface Pose {
  /** Seven cells, so the row never shifts as it changes. */
  readonly face: string;
  /** How often it comes up, against the others. */
  readonly weight: number;
  /** The fewest and most frames it holds. */
  readonly hold: readonly [number, number];
}

type Poses = readonly [Pose, ...Pose[]];

/** His own faces; the first is his resting face. */
const POSES: Poses = [
  { face: "( •_• )", weight: 6, hold: [12, 50] },
  { face: "(•_•  )", weight: 3, hold: [5, 30] },
  { face: "(  •_•)", weight: 3, hold: [5, 30] },
  { face: "( -_- )", weight: 4, hold: [2, 3] },
  { face: "( •.• )", weight: 2, hold: [6, 20] },
  { face: "( ._. )", weight: 1, hold: [8, 24] },
  { face: "( •ᴗ• )", weight: 1, hold: [6, 14] },
];

/** `given`, or his own faces when it is missing or empty. */
const posesOf = (given: ReadonlyArray<Pose> | undefined): Poses => {
  const [first, ...rest] = given ?? [];

  return first === undefined ? POSES : [first, ...rest];
};

/** A pose at random by weight; never the same one twice, except resting. */
const nextPose = (poses: Poses, previous: Pose): Pose => {
  let total = 0;

  for (const pose of poses) {
    total += pose.weight;
  }

  let roll = Math.random() * total;

  for (const pose of poses) {
    roll -= pose.weight;

    if (roll < 0) {
      return pose === previous ? poses[0] : pose;
    }
  }

  return poses[0];
};

const useFace = (
  frame: Accessor<number>,
  given: Accessor<ReadonlyArray<Pose> | undefined>,
): Accessor<string> => {
  let shown = given();
  let poses = posesOf(shown);
  let pose = poses[0];
  let until = 0;

  return createMemo(() => {
    const now = frame();
    const next = given();

    if (next !== shown) {
      shown = next;
      poses = posesOf(next);
      pose = poses[0];
      until = now + between(...pose.hold);
    }

    // A frame before the last change means the timeline looped.
    if (now >= until || until - now > pose.hold[1]) {
      pose = nextPose(poses, pose);
      until = now + between(...pose.hold);
    }

    return pose.face;
  });
};

/** What he murmurs while he thinks. */
const WORDS: ReadonlyArray<string> = [
  "lingering",
  "drifting",
  "half awake",
  "at the threshold",
  "between rooms",
  "listening",
  "turning it over",
  "gathering",
  "following a thread",
  "unfolding",
  "wandering the hall",
  "almost",
  "mulling",
  "sifting",
  "in the doorway",
  "waiting for dusk",
  "remembering",
  "crossing over",
  "humming",
  "dimming the lights",
];

const NOISE = cellsOf("abcdefghijklmnopqrstuvwxyz:;~/|_-");

/** Frames over which a word's letters land, and later leave, one by one. */
const SCRAMBLE_FRAMES = 10;

/** The fewest and most frames a word holds. */
const WORD_HOLD = [40, 80] as const;

/** Chance a settled letter flickers to noise on any frame. */
const JITTER = 0.03;

/** Frames for the shimmer to pass along a word. */
const SHIMMER_FRAMES = 30;

interface Murmur {
  readonly letters: readonly string[];
  readonly start: number;
  readonly end: number;
  /** The frame each letter lands, and the frame it leaves. */
  readonly lands: readonly number[];
  readonly leaves: readonly number[];
}

interface MurmurCell {
  readonly glyph: string;
  readonly isSettled: boolean;
}

const noise = () => NOISE[Math.floor(Math.random() * NOISE.length)] ?? " ";

/** A word alone holds for good; one of several for a while. */
const murmurOf = (word: string, now: number, isFixed: boolean): Murmur => {
  const letters = cellsOf(word);
  const end = isFixed ? Number.POSITIVE_INFINITY : now + between(...WORD_HOLD);

  return {
    letters,
    start: now,
    end,
    lands: letters.map(() => now + between(0, SCRAMBLE_FRAMES)),
    leaves: letters.map(() => end - between(1, SCRAMBLE_FRAMES)),
  };
};

const cellAt = (murmur: Murmur, cell: number, now: number): MurmurCell => {
  const letter = murmur.letters[cell] ?? " ";

  const isPresent =
    now >= (murmur.lands[cell] ?? 0) && now < (murmur.leaves[cell] ?? Number.POSITIVE_INFINITY);

  const isSettled = isPresent && Math.random() > JITTER;

  return { glyph: isSettled || letter === " " ? letter : noise(), isSettled };
};

const nextWord = (words: ReadonlyArray<string>, previous: string | undefined) => {
  const others = words.filter((word) => word !== previous);

  return others[Math.floor(Math.random() * others.length)] ?? words[0] ?? "";
};

const useMurmur = (
  frame: Accessor<number>,
  given: Accessor<ReadonlyArray<string> | undefined>,
): Accessor<readonly MurmurCell[]> => {
  let murmur: Murmur | undefined;
  let shown = "";

  return createMemo(() => {
    const now = frame();
    const list = given();
    const words = list === undefined || list.length === 0 ? WORDS : list;
    const key = words.join("\n");

    // A frame before the word started means the timeline looped.
    const isDue = murmur === undefined || key !== shown || now >= murmur.end || now < murmur.start;

    const current =
      isDue || murmur === undefined
        ? murmurOf(nextWord(words, murmur?.letters.join("")), now, words.length === 1)
        : murmur;

    murmur = current;
    shown = key;

    return current.letters.map((_, cell) => cellAt(current, cell, now));
  });
};

const shimmerAt = (frame: number, cell: number) =>
  (Math.sin((cell / 8 - frame / SHIMMER_FRAMES) * 2 * Math.PI) + 1) / 2;

/** Without `words` or `poses` he uses his own; a single word holds still. */
export function Porter(props: {
  readonly words?: ReadonlyArray<string> | undefined;
  readonly poses?: ReadonlyArray<Pose> | undefined;
}) {
  const color = useColor();
  const frame = useFrame();
  const face = useFace(frame, () => props.poses);
  const murmur = useMurmur(frame, () => props.words);

  return (
    <text flexShrink={0} wrapMode="none">
      <span style={{ fg: color("text.accent") }}>{`${face()} `}</span>
      <For each={murmur()}>
        {(cell, index) => (
          <span
            style={{
              fg: cell.isSettled
                ? mixHex(color("text.faint"), color("text.muted"), shimmerAt(frame(), index()))
                : color("text.ghost"),
            }}
          >
            {cell.glyph}
          </span>
        )}
      </For>
    </text>
  );
}
