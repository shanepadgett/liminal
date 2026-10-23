/**
 * A line for a secret, such as an API key: typed and pasted text shows as dots. It reads keys and
 * pastes while nothing has focus, as under a dialog, so it needs no focus of its own; keys the
 * keymap takes, such as enter and esc, never reach it.
 */

import { decodePasteBytes, type KeyEvent, TextAttributes } from "@opentui/core";
import { useKeyboard, usePaste } from "@opentui/solid";
import { createSignal } from "solid-js";

import { useColor } from "../colors.ts";
import { cellsOf } from "./Gradient.tsx";

/** At most this many dots show, however long the secret. */
const DOTS = 40;

/** A key that types its own text: one printable character with no ctrl or meta. */
const typedText = (key: KeyEvent) => {
  const [only, ...rest] = cellsOf(key.sequence);
  const isPrintable = only !== undefined && only >= " " && only !== "\u007F";

  return isPrintable && rest.length === 0 && !key.ctrl && !key.meta ? only : undefined;
};

export function SecretInput(props: {
  readonly placeholder: string;
  readonly onInput: (value: string) => void;
}) {
  const color = useColor();
  const [value, setValue] = createSignal("");

  const set = (next: string) => {
    setValue(next);
    props.onInput(next);
  };

  useKeyboard((key) => {
    if (key.name === "backspace") {
      set(cellsOf(value()).slice(0, -1).join(""));

      return;
    }

    const typed = typedText(key);
    if (typed !== undefined) set(value() + typed);
  });

  usePaste((event) => {
    set(value() + decodePasteBytes(event.bytes).replaceAll(/[\r\n]/gu, ""));
  });

  return (
    <box flexDirection="row">
      <text flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
        {"> "}
      </text>
      <text fg={color(value() === "" ? "text.ghost" : "text.base")}>
        {value() === "" ? props.placeholder : "•".repeat(Math.min(cellsOf(value()).length, DOTS))}
      </text>
    </box>
  );
}
