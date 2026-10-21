/** How the gallery's scripted answer splits as it streams: Markdown once finished. */

import { FRESH_CHARS, type Faded, fadeAt } from "@liminal/sdk/tui";

import type { Streaming } from "./frame.ts";

/** The answer split at `streaming.progress`; all of it Markdown once it is out. */
export const fadedOf = (streaming: Streaming): Faded =>
  streaming.progress >= 1
    ? { kind: "markdown", text: streaming.text }
    : fadeAt(
        streaming.text,
        Math.floor(streaming.progress * (streaming.text.length + FRESH_CHARS)),
      );
