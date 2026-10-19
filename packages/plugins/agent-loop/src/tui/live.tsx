/**
 * The agent loop's live states at the transcript's end. A streaming reply shows its text as it
 * arrives, the paragraph being written fading in; what it is thinking or calling is a live line, a
 * thought's summary rising under it. A waiting retry says why.
 */

import { Option, Predicate, Schema } from "effect";
import { createSignal, Index, onCleanup, Show } from "solid-js";

import { ChatSlots, type ToolRows } from "@liminal/chat/contract";
import type { LiveState } from "@liminal/sdk";
import { LiveLine, useColor, useSlotMeta, Vapor } from "@liminal/sdk/tui";

import { type LivePart, LiveReply, LiveRetry } from "../contract.ts";
import { createHead } from "./head.ts";
import { Said } from "./Said.tsx";

/** The summary sits under the live line's words, past the arc. */
const DETAIL_INDENT = 2;

interface LiveProps {
  readonly live: LiveState;
}

const decodeReply = Schema.decodeUnknownOption(LiveReply.data);
const decodeRetry = Schema.decodeUnknownOption(LiveRetry.data);

/**
 * What a call the model is writing reads as: its tool's running verb, a hidden tool's `live`, else
 * `Calling <name>`.
 */
const callingOf = (name: string | undefined, rows: ToolRows | undefined) => {
  const fallback = `Calling ${name ?? "a tool"}`;
  if (name === undefined || rows === undefined) return fallback;

  return Predicate.isTagged(rows, "Rows")
    ? rows.fold({ id: "", name, params: null }).verb
    : (rows.live ?? fallback);
};

/** Whole seconds since the caller was created, ticking once a second. */
const createSeconds = () => {
  const start = Date.now();
  const [seconds, setSeconds] = createSignal(0);
  const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);

  onCleanup(() => {
    clearInterval(timer);
  });

  return seconds;
};

/** A thought summary as plain words one space apart: no bold marks, no line breaks. */
export const plainOf = (text: string) =>
  text.replaceAll("*", "").replaceAll(/\s+/g, " ").trimStart();

/** What the model is thinking or calling: the live line, and a thought's summary rising under it. */
function Doing(props: { readonly part: LivePart; readonly label: string }) {
  const color = useColor();
  const seconds = createSeconds();
  const plain = () => plainOf(props.part.text ?? "");
  const head = createHead(plain);

  return (
    <box flexDirection="column">
      <LiveLine color={color} label={props.label} seconds={seconds()} />
      <Show when={props.part.type === "reasoning"}>
        <box paddingLeft={DETAIL_INDENT}>
          <Vapor color={color} text={plain()} head={head()} />
        </box>
      </Show>
    </box>
  );
}

function Part(props: { readonly part: LivePart }) {
  const rowsOf = useSlotMeta(ChatSlots.tool);

  const doing = () =>
    props.part.type === "reasoning"
      ? "Thinking"
      : callingOf(
          props.part.name,
          props.part.name === undefined ? undefined : rowsOf(props.part.name),
        );

  return (
    <Show when={props.part.type === "text"} fallback={<Doing part={props.part} label={doing()} />}>
      <Said text={props.part.text ?? ""} />
    </Show>
  );
}

/**
 * Whether a part still shows: text until the reply is saved, since its entry only arrives then; a
 * finished thought or call has nothing left to say.
 */
const isShown = (part: LivePart) => part.type === "text" || part.done !== true;

/**
 * The reply streaming in, until it is saved as entries. Each part keeps its place, so a part's fade
 * carries on as the parts after it stream.
 */
export function Reply(props: LiveProps) {
  const parts = () =>
    Option.match(decodeReply(props.live.data), {
      onNone: () => [],
      onSome: (reply) => reply.parts,
    });

  return (
    <box flexDirection="column" gap={1}>
      <Index each={parts()}>
        {(part) => (
          <Show when={isShown(part())}>
            <Part part={part()} />
          </Show>
        )}
      </Index>
    </box>
  );
}

/** A model call waiting to retry, and why. */
export function Retry(props: LiveProps) {
  const color = useColor();
  const retry = () => Option.getOrUndefined(decodeRetry(props.live.data));

  return (
    <Show when={retry()}>
      {(waiting) => (
        <text>
          <span
            style={{ fg: color("feedback.warning") }}
          >{`Retrying (attempt ${waiting().attempt}) `}</span>
          <span style={{ fg: color("text.faint") }}>{waiting().message}</span>
        </text>
      )}
    </Show>
  );
}
