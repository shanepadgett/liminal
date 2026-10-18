/** Copying text to the terminal's clipboard, with a moment of "copied" feedback. */

import { useRenderer } from "@opentui/solid";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/** How long `isCopied` holds after a copy. */
const COPIED_MS = 1500;

/**
 * `copy` writes `text` to the terminal's clipboard through OSC 52; `isCopied` is true for a moment
 * after.
 */
export const useCopy = (): {
  readonly isCopied: Accessor<boolean>;
  readonly copy: (text: string) => void;
} => {
  const renderer = useRenderer();
  const [isCopied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    clearTimeout(timer);
  });

  const copy = (text: string) => {
    renderer.copyToClipboardOSC52(text);
    setCopied(true);
    clearTimeout(timer);
    timer = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return { isCopied, copy };
};
