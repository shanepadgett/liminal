/**
 * The agent loop's live states at the transcript's end. A streaming reply shows its text as it
 * arrives, the paragraph being written fading in, and what it is thinking or calling as quiet rows;
 * a waiting retry says why.
 */

import { Option, Predicate, Schema } from "effect";
import { Index, Show } from "solid-js";

import { ChatSlots, type ToolRows } from "@liminal/chat/contract";
import type { LiveState } from "@liminal/sdk";
import { useColor, useSlotMeta } from "@liminal/sdk/tui";

import { type LivePart, LiveReply, LiveRetry } from "../contract.ts";
import { Said } from "./Said.tsx";

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

function Part(props: { readonly part: LivePart }) {
  const color = useColor();
  const rowsOf = useSlotMeta(ChatSlots.tool);

  const doing = () =>
    props.part.type === "reasoning"
      ? "Thinking"
      : callingOf(
          props.part.name,
          props.part.name === undefined ? undefined : rowsOf(props.part.name),
        );

  return (
    <Show
      when={props.part.type === "text"}
      fallback={
        <text>
          <span style={{ fg: color("text.ghost") }}>◇ </span>
          <span style={{ fg: color("text.muted") }}>{doing()}</span>
        </text>
      }
    >
      <Said text={props.part.text ?? ""} />
    </Show>
  );
}

/**
 * The reply streaming in; finished parts leave it once they are saved as entries. Each part keeps
 * its place, so a part's fade carries on as the parts before it finish.
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
          <Show when={part().done !== true}>
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
