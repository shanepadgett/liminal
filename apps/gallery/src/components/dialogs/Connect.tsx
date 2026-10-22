/**
 * The steps of `/connect` after the provider and method pickers: pasting an API key, and waiting
 * while the user signs in in the browser.
 */

import { TextAttributes } from "@opentui/core";
import { Show } from "solid-js";

import { useColor } from "../../theme/theme.tsx";
import { Dialog } from "./Dialog.tsx";

const BACK = { keys: "esc", label: "back" };

/** A pasted key shows as dots, up to this many. */
const KEY_DOTS = 40;

export function ConnectKey(props: {
  readonly provider: string;
  readonly where: string;
  readonly apiKey: string;
  readonly error?: string;
}) {
  const color = useColor();

  return (
    <Dialog title={`Connect ${props.provider}`} hints={[{ keys: "enter", label: "save" }, BACK]}>
      <text fg={color("text.muted")}>{`Paste an API key from ${props.where}.`}</text>
      <box flexDirection="row" marginTop={1}>
        <text flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
          {"> "}
        </text>
        <text fg={color(props.apiKey === "" ? "text.ghost" : "text.base")}>
          {props.apiKey === "" ? "API key" : "•".repeat(Math.min(props.apiKey.length, KEY_DOTS))}
        </text>
      </box>
      <Show when={props.error}>
        {(error) => (
          <text marginTop={1} fg={color("feedback.danger")}>
            {error()}
          </text>
        )}
      </Show>
    </Dialog>
  );
}

export function ConnectBrowser(props: {
  readonly provider: string;
  readonly url: string;
  /** The code to type on the provider's page, for device sign-in. */
  readonly code?: string;
}) {
  const color = useColor();

  return (
    <Dialog title={`Connect ${props.provider}`} hints={[{ keys: "c", label: "copy link" }, BACK]}>
      <text fg={color("text.muted")}>Finish signing in in your browser.</text>
      <text fg={color("text.muted")}>If it did not open, go to</text>
      <text fg={color("text.accent")} attributes={TextAttributes.UNDERLINE}>
        {props.url}
      </text>
      <Show when={props.code}>
        {(code) => (
          <box marginTop={1}>
            <text fg={color("text.muted")}>and enter this code:</text>
            <text fg={color("text.heading")} attributes={TextAttributes.BOLD}>
              {code()}
            </text>
          </box>
        )}
      </Show>
      <text marginTop={1} fg={color("text.faint")}>
        Waiting for the browser…
      </text>
    </Dialog>
  );
}
