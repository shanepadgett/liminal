/**
 * The `/connect` dialogs. The first lists the providers, each marked when it is signed in. Picking
 * one lists its ways to sign in, each with its state at the right: saved, found in an environment
 * variable, or nothing when signed out. A provider with one way skips that list. Picking a way asks
 * how to finish it when there is a choice, then opens the login, which shows the step the server is
 * on. `ctrl+d` on a signed-in provider or way asks before signing out.
 */

import { For, Match, Switch } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";

/** How a way is signed in: not at all, a saved login, or a key in an environment variable. */
type SignIn = "out" | "saved" | `env:${string}`;

/** One way to sign in to a provider, such as a subscription login or an API key. */
type Way = { readonly title: string; readonly state: SignIn };

/** A provider as `/connect` lists it: its name and its ways to sign in. */
export type Vendor = { readonly name: string; readonly ways: readonly Way[] };

const PROVIDERS_HINTS: readonly Hint[] = [
  ["enter", "choose"],
  ["ctrl+d", "sign out"],
  ["esc", "close"],
];

const WAYS_HINTS: readonly Hint[] = [
  ["enter", "sign in"],
  ["ctrl+d", "sign out"],
  ["esc", "back"],
];

const METHODS_HINTS: readonly Hint[] = [
  ["enter", "sign in"],
  ["esc", "back"],
];

const stateText = (state: SignIn) => {
  if (state === "out") return "";
  if (state === "saved") return "saved";

  return `from ${state.slice("env:".length)}`;
};

/** A provider is signed in when any of its ways is, by a saved login or a key in the environment. */
const isSignedIn = (vendor: Vendor) => vendor.ways.some((way) => way.state !== "out");

function StateRow(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly state: string;
  readonly isSelected: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <text
        flexGrow={1}
        wrapMode="none"
        fg={props.color(props.isSelected ? "text.base" : "text.muted")}
      >
        {props.title}
      </text>
      <text flexShrink={0} wrapMode="none" fg={props.color("feedback.success")}>
        {props.state}
      </text>
    </ListRow>
  );
}

/** Every provider, marked when signed in; `selected` is the name under the cursor. */
export function ProviderList(props: {
  readonly color: RoleColor;
  readonly vendors: readonly Vendor[];
  readonly selected: string;
}) {
  return (
    <Dialog color={props.color} title="Connect a provider" hints={PROVIDERS_HINTS}>
      <box flexDirection="column">
        <For each={props.vendors}>
          {(vendor) => (
            <StateRow
              color={props.color}
              title={vendor.name}
              state={isSignedIn(vendor) ? "signed in" : ""}
              isSelected={vendor.name === props.selected}
            />
          )}
        </For>
      </box>
    </Dialog>
  );
}

/** One provider's ways to sign in, each with its state; `selected` is the title under the cursor. */
export function WayList(props: {
  readonly color: RoleColor;
  readonly vendor: Vendor;
  readonly selected: string;
}) {
  return (
    <Dialog color={props.color} title={props.vendor.name} hints={WAYS_HINTS}>
      <box flexDirection="column">
        <For each={props.vendor.ways}>
          {(way) => (
            <StateRow
              color={props.color}
              title={way.title}
              state={stateText(way.state)}
              isSelected={way.title === props.selected}
            />
          )}
        </For>
      </box>
    </Dialog>
  );
}

/** How to finish a way that has more than one, such as the browser or a device code. */
export function MethodList(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly methods: readonly string[];
  readonly selected: string;
}) {
  return (
    <Dialog color={props.color} title={props.title} hints={METHODS_HINTS}>
      <box flexDirection="column">
        <For each={props.methods}>
          {(method) => (
            <StateRow
              color={props.color}
              title={method}
              state=""
              isSelected={method === props.selected}
            />
          )}
        </For>
      </box>
    </Dialog>
  );
}

const SIGN_OUT_HINTS: readonly Hint[] = [
  ["enter", "sign out"],
  ["esc", "keep"],
];

/** Asks before removing a saved login. */
export function SignOutDialog(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly question: string;
}) {
  return (
    <Dialog color={props.color} title={props.title} hints={SIGN_OUT_HINTS}>
      <text fg={props.color("text.base")}>{props.question}</text>
    </Dialog>
  );
}

/** One line to type into; a secret shows a dot for each character. */
function PromptField(props: {
  readonly color: RoleColor;
  readonly question: string;
  readonly text: string;
  readonly isSecret: boolean;
}) {
  const shown = () => (props.isSecret ? "•".repeat(props.text.length) : props.text);

  return (
    <box flexDirection="column" gap={1}>
      <text fg={props.color("text.base")}>{props.question}</text>
      <text wrapMode="none">
        <span style={{ fg: props.color("text.accent") }}>{"› "}</span>
        <span style={{ fg: props.color("text.heading") }}>{shown()}</span>
        <span style={{ bg: props.color("text.accent") }}> </span>
      </text>
    </box>
  );
}

const PROMPT_HINTS: readonly Hint[] = [
  ["enter", "save"],
  ["esc", "back"],
];

/** A login that asks for text, such as an API key. */
export function PromptDialog(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly question: string;
  readonly text: string;
  readonly isSecret: boolean;
  /** A faint line under the field, such as where a key is kept. */
  readonly note: string;
}) {
  return (
    <Dialog color={props.color} title={props.title} hints={PROMPT_HINTS}>
      <PromptField
        color={props.color}
        question={props.question}
        text={props.text}
        isSecret={props.isSecret}
      />
      <text fg={props.color("text.faint")}>{props.note}</text>
    </Dialog>
  );
}

/** The step a login is on, as the server streams it. */
export type LoginStep =
  | { readonly type: "open-url"; readonly url: string }
  | { readonly type: "show-code"; readonly code: string; readonly url: string }
  | { readonly type: "failed"; readonly message: string };

function WaitingLine(props: { readonly color: RoleColor; readonly text: string }) {
  return <text fg={props.color("text.faint")}>{props.text}</text>;
}

function LoginBody(props: { readonly color: RoleColor; readonly step: LoginStep }) {
  return (
    <Switch>
      <Match when={props.step.type === "open-url" && props.step}>
        {(step) => (
          <box flexDirection="column" gap={1}>
            <text fg={props.color("text.base")}>Sign in in the browser that opened, or open:</text>
            <text fg={props.color("text.accent")}>{step().url}</text>
            <WaitingLine color={props.color} text="Waiting for the browser…" />
          </box>
        )}
      </Match>
      <Match when={props.step.type === "show-code" && props.step}>
        {(step) => (
          <box flexDirection="column" gap={1}>
            <text fg={props.color("text.base")}>Open this page and enter the code:</text>
            <box flexDirection="column">
              <text fg={props.color("text.accent")}>{step().url}</text>
              <text fg={props.color("text.heading")}>{step().code}</text>
            </box>
            <WaitingLine color={props.color} text="Waiting for the code to be entered…" />
          </box>
        )}
      </Match>
      <Match when={props.step.type === "failed" && props.step}>
        {(step) => <text fg={props.color("feedback.danger")}>{step().message}</text>}
      </Match>
    </Switch>
  );
}

const WORKING_HINTS: readonly Hint[] = [["esc", "cancel"]];

const FAILED_HINTS: readonly Hint[] = [
  ["enter", "retry"],
  ["esc", "back"],
];

/** A login in progress; `esc` stops it. A failed one can be tried again. */
export function LoginDialog(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly step: LoginStep;
}) {
  const hints = () => (props.step.type === "failed" ? FAILED_HINTS : WORKING_HINTS);

  return (
    <Dialog color={props.color} title={props.title} hints={hints()}>
      <LoginBody color={props.color} step={props.step} />
    </Dialog>
  );
}
