/**
 * The agent loop's live states at the transcript's end. A streaming reply shows its text as it
 * arrives, and what it is thinking or calling as quiet rows; a waiting retry says why.
 */

import { Option, Schema } from "effect";
import { Index, Show } from "solid-js";

import type { LiveState } from "@liminal/sdk";
import { useColor, useMarkdownStyle } from "@liminal/sdk/tui";

import { type LivePart, LiveReply, LiveRetry } from "../contract.ts";

interface LiveProps {
  readonly live: LiveState;
}

const decodeReply = Schema.decodeUnknownOption(LiveReply.data);
const decodeRetry = Schema.decodeUnknownOption(LiveRetry.data);

const doingOf = (part: LivePart) =>
  part.type === "reasoning" ? "Thinking" : `Calling ${part.name ?? "a tool"}`;

function Part(props: { readonly part: LivePart }) {
  const color = useColor();
  const style = useMarkdownStyle(() => color);

  return (
    <Show
      when={props.part.type === "text"}
      fallback={
        <text>
          <span style={{ fg: color("text.ghost") }}>◇ </span>
          <span style={{ fg: color("text.muted") }}>{doingOf(props.part)}</span>
        </text>
      }
    >
      <markdown
        content={props.part.text ?? ""}
        syntaxStyle={style()}
        fg={color("text.base")}
        streaming
        conceal
      />
    </Show>
  );
}

/** The reply streaming in; finished parts leave it once they are saved as entries. */
export function Reply(props: LiveProps) {
  const parts = () =>
    Option.match(decodeReply(props.live.data), {
      onNone: () => [],
      onSome: (reply) => reply.parts.filter((part) => part.done !== true),
    });

  return (
    <box flexDirection="column" gap={1}>
      <Index each={parts()}>{(part) => <Part part={part()} />}</Index>
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
