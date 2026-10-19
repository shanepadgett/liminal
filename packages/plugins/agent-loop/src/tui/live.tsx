/**
 * The agent loop's live states at the transcript's end. A streaming reply shows its text as it
 * arrives, the paragraph being written fading in; what it is thinking or calling is a live line, a
 * thought's summary rising under it, and a finished thought is a work row joined to the work around
 * it. A waiting retry says why.
 */

import { Option, Predicate, Schema } from "effect";
import { createSignal, Index, Match, onCleanup, Show, Switch } from "solid-js";

import { ChatSlots, type ToolRows } from "@liminal/chat/contract";
import type { LiveState } from "@liminal/sdk";
import {
  LiveLine,
  thoughtWording,
  useColor,
  useSlotMeta,
  Vapor,
  WorkWords,
} from "@liminal/sdk/tui";

import { type LivePart, LiveReply, LiveRetry } from "../contract.ts";
import { createHead } from "./head.ts";
import { Said } from "./Said.tsx";

/** The summary sits under the live line's words, past the arc. */
const DETAIL_INDENT = 2;

interface LiveProps {
  readonly live: LiveState;
  readonly afterWork: boolean;
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

/** What the model has thought, once the thought is finished: a work row like the saved one. */
function Thought(props: { readonly text: string }) {
  const color = useColor();

  return <WorkWords color={color} mark="◆" words={thoughtWording(props.text)} dim={0} />;
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
    <Switch fallback={<Doing part={props.part} label={doing()} />}>
      <Match when={props.part.type === "text"}>
        <Said text={props.part.text ?? ""} />
      </Match>
      <Match when={props.part.type === "reasoning" && props.part.done === true}>
        <Thought text={props.part.text ?? ""} />
      </Match>
    </Switch>
  );
}

/**
 * Whether a part still shows. Text and a thought with words stay until the reply is saved, since
 * their entries only arrive then; a finished call, or a thought with no summary, has nothing left
 * to say.
 */
const isShown = (part: LivePart) => {
  if (part.done !== true || part.type === "text") return true;

  return part.type === "reasoning" && (part.text ?? "").trim() !== "";
};

/** Whether a part draws as work: a thought or a call, not reply text. */
const isWork = (part: LivePart) => part.type !== "text";

/**
 * The space above the part at `index`. Work joins the work before it with no gap, as it will once
 * saved; anything else sits a line apart. The transcript already leaves a line above the reply, so
 * its first part takes that line back to join the work above it.
 */
const spaceAbove = (parts: ReadonlyArray<LivePart>, index: number, afterWork: boolean) => {
  const part = parts[index];
  const before = parts.slice(0, index).findLast(isShown);
  if (part === undefined) return 0;

  const joins = isWork(part) && (before === undefined ? afterWork : isWork(before));
  if (before === undefined) return joins ? -1 : 0;

  return joins ? 0 : 1;
};

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
    <box flexDirection="column">
      <Index each={parts()}>
        {(part, index) => (
          <Show when={isShown(part())}>
            <box flexDirection="column" marginTop={spaceAbove(parts(), index, props.afterWork)}>
              <Part part={part()} />
            </box>
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
