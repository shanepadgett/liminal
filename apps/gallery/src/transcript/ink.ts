/** How far the gallery's scripted streams are out: the head of the ink at a stream's progress. */

import { FRESH_CHARS } from "@liminal/sdk/tui";

import type { Streaming } from "./frame.ts";

/**
 * How many characters are out: the head runs past the end by the fade's length, so finished text
 * has settled all the way.
 */
export const headOf = (streaming: Streaming) =>
  Math.floor(streaming.progress * (streaming.text.replaceAll("`", "").length + FRESH_CHARS));
