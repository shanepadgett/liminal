/**
 * The sign-in dialog: follows `accounts/sign-in` while it is open, so closing it stops the sign-in.
 * It keeps what the steps said so far: the link and code to visit, the latest message, and the open
 * question as an input. `Done` closes it; a failure stays on screen until esc.
 */
import { TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { type JSX, useRenderer } from "@opentui/solid";
import { Data, Effect, Match, Predicate, Redacted, Stream } from "effect";
import { createSignal, Show } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import {
  keymapCommand,
  kit,
  useColor,
  useHints,
  useRun,
  useWatch,
} from "@shanepadgett/liminal-tui";

import { AccountsRpc, type LoginStep } from "../contract.ts";

/** Which sign-in to run, and the vendor the title names. */
export interface SignInTarget {
  readonly vendor: string;
  readonly method: string;
  readonly way: string;
}

interface Question {
  readonly question: string;
  readonly secret: boolean;
}

/** What the steps said so far. */
interface Shown {
  readonly url: string | undefined;
  readonly code: string | undefined;
  readonly message: string | undefined;
  readonly ask: Question | undefined;
  readonly failure: string | undefined;
}

const NOTHING: Shown = {
  url: undefined,
  code: undefined,
  message: undefined,
  ask: undefined,
  failure: undefined,
};

/** The sign-in failed; its message stays on screen. */
class Failed extends Data.TaggedClass("Failed")<{ readonly message: string }> {}

type Event = LoginStep | Failed;

/** A later step withdraws the open question. */
const next = (shown: Shown, event: Event): Shown =>
  Match.valueTags(event, {
    OpenUrl: ({ url }): Shown => ({ ...shown, url, code: undefined, ask: undefined }),
    ShowCode: ({ code, url }): Shown => ({ ...shown, url, code, ask: undefined }),
    Ask: ({ question, secret }): Shown => ({ ...shown, ask: { question, secret } }),
    Waiting: ({ text }): Shown => ({ ...shown, message: text, ask: undefined }),
    Told: ({ text }): Shown => ({ ...shown, message: text, ask: undefined }),
    Done: (): Shown => shown,
    Failed: ({ message }): Shown => ({ ...shown, failure: message, ask: undefined }),
  });

const client = Effect.flatMap(Host, (host) => host.client(AccountsRpc));

const signIn = (target: SignInTarget, close: () => void) =>
  Stream.unwrap(
    Effect.map(client, (accounts) =>
      accounts["accounts/sign-in"]({ method: target.method, way: target.way }),
    ),
  ).pipe(
    Stream.tap((step) => (Predicate.isTagged(step, "Done") ? Effect.sync(close) : Effect.void)),
    Stream.orElseSucceed((error): Event => new Failed({ message: error.message })),
    Stream.scan(() => NOTHING, next),
  );

const answer = (method: string, text: string) =>
  Effect.scoped(
    Effect.flatMap(client, (accounts) =>
      accounts["accounts/answer"]({ method, text: Redacted.make(text) }),
    ),
  );

/** Enter answers the open question, `ctrl+y` copies the code or link, esc closes. */
const useSignInKeys = (keys: {
  readonly asking: () => boolean;
  readonly send: () => void;
  readonly copy: { readonly label: () => string | undefined; readonly run: () => void };
  readonly close: () => void;
}) => {
  useBindings(() => ({
    priority: 1,
    commands: [
      { name: "sign-in.answer", title: "Send the answer", enabled: keys.asking, run: keys.send },
      {
        name: "sign-in.copy",
        title: "Copy",
        hint: { label: keys.copy.label() ?? "copy" },
        enabled: () => keys.copy.label() !== undefined,
        run: keys.copy.run,
      },
      { name: "sign-in.close", title: "Close", run: keys.close },
    ].map(keymapCommand),
    bindings: [
      { key: "return", cmd: "sign-in.answer" },
      { key: "kpenter", cmd: "sign-in.answer" },
      { key: "ctrl+y", cmd: "sign-in.copy" },
      { key: "escape", cmd: "sign-in.close" },
    ],
  }));
};

/** The link to visit, and the code to enter there for a device sign-in. */
function Link(props: { readonly url: string; readonly code: string | undefined }) {
  const color = useColor();

  return (
    <box marginBottom={1}>
      <text fg={color("text.muted")}>
        {props.code === undefined ? "Sign in at" : "Enter the code below at"}
      </text>
      <text fg={color("text.accent")} attributes={TextAttributes.UNDERLINE} wrapMode="char">
        {props.url}
      </text>
      <Show when={props.code}>
        {(code) => (
          <text marginTop={1} fg={color("text.heading")} attributes={TextAttributes.BOLD}>
            {code()}
          </text>
        )}
      </Show>
    </box>
  );
}

/** The open question and where the answer is typed. */
function Asking(props: { readonly ask: Question; readonly onInput: (text: string) => void }) {
  const color = useColor();

  const entry = (): JSX.Element =>
    props.ask.secret ? (
      <kit.SecretInput placeholder={props.ask.question} onInput={props.onInput} />
    ) : (
      <box flexDirection="row">
        <text flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
          {"> "}
        </text>
        <input
          focused
          flexGrow={1}
          placeholder={props.ask.question}
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          backgroundColor={color("surface.overlay")}
          onInput={props.onInput}
        />
      </box>
    );

  return <box marginBottom={1}>{entry()}</box>;
}

export function SignIn(props: { readonly target: SignInTarget; readonly close: () => void }) {
  const color = useColor();
  const run = useRun();
  const renderer = useRenderer();
  const hints = useHints();
  const shown = useWatch(signIn(props.target, props.close), NOTHING);
  const [typed, setTyped] = createSignal("");
  const [answered, setAnswered] = createSignal<Question>();
  const asking = () => (shown().ask === answered() ? undefined : shown().ask);

  const send = () => {
    setAnswered(asking());
    run(answer(props.target.method, typed()));
    setTyped("");
  };

  const copied = () => shown().code ?? shown().url;

  useSignInKeys({
    asking: () => asking() !== undefined,
    send,
    copy: {
      label: () => {
        if (shown().code !== undefined) return "copy code";

        return shown().url === undefined ? undefined : "copy link";
      },
      run: () => {
        const text = copied();
        if (text !== undefined) renderer.copyToClipboardOSC52(text);
      },
    },
    close: props.close,
  });

  return (
    <kit.Dialog title={`Connect ${props.target.vendor}`} hints={hints()}>
      <Show when={shown() === NOTHING}>
        <text fg={color("text.faint")}>Starting the sign-in…</text>
      </Show>
      <Show when={shown().url}>{(url) => <Link url={url()} code={shown().code} />}</Show>
      <Show when={asking()} keyed>
        {(ask) => <Asking ask={ask} onInput={setTyped} />}
      </Show>
      <Show when={shown().message}>
        {(message) => <text fg={color("text.muted")}>{message()}</text>}
      </Show>
      <Show when={shown().failure}>
        {(failure) => <text fg={color("feedback.danger")}>{failure()}</text>}
      </Show>
    </kit.Dialog>
  );
}
