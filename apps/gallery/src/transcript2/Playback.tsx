/**
 * A session with its last turns playing out in real time, one after another: the assistant thinks,
 * works, drafts its questions, the user's answers arrive, and it works to an answer. The finished
 * session holds for a moment, then plays again from the first of those turns.
 */

import type { RoleColor } from "../tokens/roles.ts";
import { Conversation } from "./Conversation.tsx";
import { sessionDurationOf } from "./play.ts";
import type { Script } from "./script.ts";
import { useClock } from "./useClock.ts";

/** How long the finished session stays on screen before it plays again. */
const HOLD_MS = 7000;

export function Playback(props: {
  readonly color: RoleColor;
  readonly finished: readonly Script[];
  readonly playing: readonly Script[];
}) {
  const ms = useClock(sessionDurationOf(props.playing) + HOLD_MS);

  return (
    <Conversation color={props.color} finished={props.finished} playing={props.playing} ms={ms()} />
  );
}
