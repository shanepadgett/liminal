/**
 * The key hints row, read from the key map so it always shows the keys that work right now. Keys
 * whose bindings share a `desc` sit together under it: `←→ group`.
 */

import type { KeyEvent, Renderable } from "@opentui/core";
import type { ActiveKey } from "@opentui/keymap";
import { useKeymapSelector } from "@opentui/keymap/solid";
import { Predicate } from "effect";

import { CHROME } from "./chrome.ts";

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  pageup: "pgup",
  pagedown: "pgdn",
  "shift+s": "S",
};

type Hint = { readonly desc: string; readonly keys: readonly string[] };

const groupHints = (active: readonly ActiveKey<Renderable, KeyEvent>[]): readonly Hint[] => {
  const hints = new Map<string, string[]>();

  for (const key of active) {
    const desc = key.bindingAttrs?.["desc"];
    if (!Predicate.isString(desc)) continue;
    hints.set(desc, [...(hints.get(desc) ?? []), KEY_GLYPHS[key.display] ?? key.display]);
  }

  return [...hints].map(([desc, keys]) => ({ desc, keys }));
};

/** Arrows read as one symbol, `←→`; letters and named keys need a space, `s S`, `pgup pgdn`. */
const joinKeys = (keys: readonly string[]) =>
  keys.join(keys.every((key) => key.length === 1 && !/\w/u.test(key)) ? "" : " ");

export function KeyHints() {
  const hints = useKeymapSelector((keymap) =>
    groupHints(keymap.getActiveKeys({ includeMetadata: true })),
  );

  return (
    <text fg={CHROME.faint}>
      {hints()
        .map((hint) => `${joinKeys(hint.keys)} ${hint.desc}`)
        .join("   ")}
    </text>
  );
}
