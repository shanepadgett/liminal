/** Tool output: the most a call's result or failure message may hold before it is cut. */

import { Context, type Effect } from "effect";

import type { SessionId } from "@liminal/sdk";

/** Output past either limit is cut to its first and last halves. */
export const outputLimits = { characters: 50_000, lines: 2_000 } as const;

/** Fits long text, such as a tool result or a checks report, within `outputLimits`. */
export class LongOutput extends Context.Service<
  LongOutput,
  {
    /**
     * `text` itself when within the limits; otherwise its first and last halves, with a line naming
     * the private file under the session's folder, `<name>.txt`, that holds the whole text.
     */
    readonly fit: (session: SessionId, name: string, text: string) => Effect.Effect<string>;
  }
>()("liminal/tool-output/LongOutput") {}
