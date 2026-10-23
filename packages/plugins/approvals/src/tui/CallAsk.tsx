/**
 * The ask for a call the reviewer would not allow: the reviewer's summary, one line per effect with
 * deletions and sends in the warning color, and the risk. The call's input stays in its transcript
 * row. A failed review says so in the summary's place.
 */

import { Option, Schema } from "effect";
import { For, Show } from "solid-js";

import type { AskProps } from "@shanepadgett/liminal-questions/tui";
import { useColor } from "@shanepadgett/liminal-tui";

import { callQuestion, type Change, type Review, type Verdict } from "../contract.ts";
import { Choose } from "./Choose.tsx";

const decodeCall = Schema.decodeOption(callQuestion.data);

const KIND_COLUMNS = 10;

const verdictOf = (review: Review) => (review.kind === "verdict" ? review.verdict : undefined);

const failureOf = (review: Review) => (review.kind === "failed" ? review.message : "");

const isAlarming = (change: Change) => change.kind === "deletes" || change.kind === "sends";

function Found(props: { readonly verdict: Verdict }) {
  const color = useColor();

  return (
    <box>
      <text fg={color("text.base")}>{props.verdict.summary}</text>
      <For each={props.verdict.effects}>
        {(change) => (
          <text>
            <span style={{ fg: color(isAlarming(change) ? "feedback.warning" : "text.muted") }}>
              {change.kind.padEnd(KIND_COLUMNS)}
            </span>
            <span style={{ fg: color("text.base") }}>{change.target}</span>
          </text>
        )}
      </For>
      <text fg={color("text.muted")}>{props.verdict.risk}</text>
    </box>
  );
}

export function CallAsk(props: AskProps) {
  const color = useColor();
  const call = () => Option.getOrUndefined(decodeCall(props.ask.data));

  return (
    <Show when={call()}>
      {(asked) => (
        <Choose {...props} title={`Run ${asked().tool}?`}>
          <Show
            when={verdictOf(asked().review)}
            fallback={
              <text fg={color("feedback.warning")}>
                {`The review failed: ${failureOf(asked().review)}. No one checked this call.`}
              </text>
            }
          >
            {(verdict) => <Found verdict={verdict()} />}
          </Show>
        </Choose>
      )}
    </Show>
  );
}
