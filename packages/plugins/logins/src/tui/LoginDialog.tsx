/**
 * A login in progress: what the server's flow has shown so far, and the question it waits on. Esc
 * closes it, which ends the stream and stops the flow. A failed login can be tried again with
 * enter.
 */

import { Predicate, Stream } from "effect";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
  type Bridge,
  DialogFrame,
  type DialogProps,
  type Hint,
  PromptField,
  useBindings,
  useColor,
} from "@liminal/sdk/tui";

import { appendStep, type Shown } from "./steps.ts";

export interface LoginDialogProps extends DialogProps {
  readonly title: string;
  readonly bridge: Bridge;
  /** The login's steps; each run of the stream starts it again. */
  readonly steps: Stream.Stream<Shown>;
  readonly answer: (text: string) => void;
  /** Runs once the login is saved. */
  readonly onDone: () => void;
}

const WORKING: readonly Hint[] = [["esc", "cancel"]];

const FAILED: readonly Hint[] = [
  ["enter", "retry"],
  ["esc", "back"],
];

function LinkLines(props: {
  readonly lead: string;
  readonly url: string;
  readonly code: string | undefined;
}) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <text fg={color("text.base")}>{props.lead}</text>
      <text fg={color("text.accent")}>{props.url}</text>
      <Show when={props.code}>{(code) => <text fg={color("text.heading")}>{code()}</text>}</Show>
    </box>
  );
}

/** One shown step; a step never changes, so it is drawn once. */
function StepLine(props: { readonly shown: Shown }) {
  const color = useColor();
  const { shown } = props;

  if (Predicate.isTagged(shown, "OpenUrl"))
    return <LinkLines lead="Sign in in the browser, or open:" url={shown.url} code={undefined} />;

  if (Predicate.isTagged(shown, "ShowCode"))
    return (
      <LinkLines lead="Open this page and enter the code:" url={shown.url} code={shown.code} />
    );

  if (Predicate.isTagged(shown, "Waiting"))
    return <text fg={color("text.faint")}>{shown.text}</text>;

  if (Predicate.isTagged(shown, "Told")) return <text fg={color("text.base")}>{shown.text}</text>;

  if (Predicate.isTagged(shown, "Failed"))
    return <text fg={color("feedback.danger")}>{shown.message}</text>;

  return null;
}

/** One run of the login, from start to done or failed. */
function Attempt(props: LoginDialogProps & { readonly retry: () => void }) {
  const shown = props.bridge.watch(props.steps.pipe(Stream.scan(() => [], appendStep)), []);
  const [answered, setAnswered] = createSignal(0);
  const last = () => shown().at(-1);
  const asks = createMemo(() => shown().filter((step) => Predicate.isTagged(step, "Ask")));
  const hasFailed = createMemo(() => Predicate.isTagged(last(), "Failed"));

  /** The question still waiting for an answer, if the flow is on one. */
  const asking = () => {
    const step = last();

    return Predicate.isTagged(step, "Ask") && asks().length > answered() ? step : undefined;
  };

  createEffect(() => {
    if (Predicate.isTagged(last(), "Done")) props.onDone();
  });

  useBindings(() => ({
    commands: [{ name: "login.retry", run: props.retry }],
    bindings: hasFailed() ? [{ key: "return", cmd: "login.retry" }] : [],
  }));

  return (
    <DialogFrame title={props.title} hints={hasFailed() ? FAILED : WORKING} close={props.close}>
      <box flexDirection="column" gap={1}>
        <For each={shown()}>{(step) => <StepLine shown={step} />}</For>
        <Show when={asking()}>
          {(ask) => (
            <PromptField
              question={ask().question}
              isSecret={ask().isSecret}
              onSubmit={(text) => {
                setAnswered(asks().length);
                props.answer(text);
              }}
            />
          )}
        </Show>
      </box>
    </DialogFrame>
  );
}

export function LoginDialog(props: LoginDialogProps) {
  const [attempt, setAttempt] = createSignal(0);

  return (
    // Each retry is a new item, so the attempt is drawn afresh and its stream starts again.
    <For each={[attempt()]}>
      {() => <Attempt {...props} retry={() => setAttempt((count) => count + 1)} />}
    </For>
  );
}
