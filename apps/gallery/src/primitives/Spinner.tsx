/**
 * Shows a turn is working: a little face thinking to itself, glancing about and blinking at uneven
 * moments, beside a murmur of words. Each word scrambles into place letter by letter, shimmers and
 * flickers while it holds, then scrambles away for the next.
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

interface Pose {
  readonly face: string;
  /** How often it comes up, against the others. */
  readonly weight: number;
  /** The fewest and most frames it holds. */
  readonly hold: readonly [number, number];
}

/** Every face is seven cells, so the row never shifts as it changes. */
const POSES: readonly [Pose, ...Pose[]] = [
  { face: "( •_• )", weight: 6, hold: [12, 50] },
  { face: "(•_•  )", weight: 3, hold: [5, 30] },
  { face: "(  •_•)", weight: 3, hold: [5, 30] },
  { face: "( -_- )", weight: 4, hold: [2, 3] },
  { face: "( •.• )", weight: 2, hold: [6, 20] },
  { face: "( ._. )", weight: 1, hold: [8, 24] },
  { face: "( •ᴗ• )", weight: 1, hold: [6, 14] },
];

/** A pose at random by weight; never the same one twice, except resting. */
const nextPose = (previous: Pose): Pose => {
  let total = 0;

  for (const pose of POSES) {
    total += pose.weight;
  }

  let roll = Math.random() * total;

  for (const pose of POSES) {
    roll -= pose.weight;

    if (roll < 0) {
      return pose === previous ? POSES[0] : pose;
    }
  }

  return POSES[0];
};

const useFace = (frame: Accessor<number>): Accessor<string> => {
  let pose = POSES[0];
  let until = 0;

  return createMemo(() => {
    const now = frame();

    // A frame before the last change means the timeline looped.
    if (now >= until || until - now > pose.hold[1]) {
      pose = nextPose(pose);
      until = now + between(...pose.hold);
    }

    return pose.face;
  });
};

/** What it murmurs while it thinks. */
const WORDS = [
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
] as const;

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

/** A fixed label holds for good; a murmured word for a while. */
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

const nextWord = (previous: string | undefined) => {
  const others = WORDS.filter((word) => word !== previous);

  return others[Math.floor(Math.random() * others.length)] ?? WORDS[0];
};

const useMurmur = (
  frame: Accessor<number>,
  label: Accessor<string | undefined>,
): Accessor<readonly MurmurCell[]> => {
  let murmur: Murmur | undefined;

  return createMemo(() => {
    const now = frame();
    const fixed = label();

    if (murmur === undefined || now >= murmur.end || now < murmur.start) {
      murmur = murmurOf(fixed ?? nextWord(murmur?.letters.join("")), now, fixed !== undefined);
    }

    const current = murmur;

    return current.letters.map((_, cell) => cellAt(current, cell, now));
  });
};

const shimmerAt = (frame: number, cell: number) =>
  (Math.sin((cell / 8 - frame / SHIMMER_FRAMES) * 2 * Math.PI) + 1) / 2;

/** Without a label it murmurs words of its own; with one it settles on that. */
export function Spinner(props: { readonly label?: string }) {
  const color = useColor();
  const frame = useFrame();
  const face = useFace(frame);
  const murmur = useMurmur(frame, () => props.label);

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
