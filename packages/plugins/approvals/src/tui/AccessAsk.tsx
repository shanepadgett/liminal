/**
 * The ask for a folder the model wants to reach: the folder exactly as it would be allowed, reading
 * or changing, and the agent's reason labelled as the agent's.
 */

import { Option, Schema } from "effect";
import { Show } from "solid-js";

import type { AskProps } from "@shanepadgett/liminal-questions/tui";
import { useColor } from "@shanepadgett/liminal-tui";

import { accessQuestion } from "../contract.ts";
import { Choose } from "./Choose.tsx";

const decodeAccess = Schema.decodeOption(accessQuestion.data);

export function AccessAsk(props: AskProps) {
  const color = useColor();
  const asked = () => Option.getOrUndefined(decodeAccess(props.ask.data));

  return (
    <Show when={asked()}>
      {(access) => (
        <Choose
          {...props}
          title={
            access().write
              ? "Allow changing files outside the workspace?"
              : "Allow reading outside the workspace?"
          }
        >
          <text fg={color("text.base")}>{access().path}</text>
          <text fg={color("text.muted")}>{`The agent says: "${access().reason}"`}</text>
          <Show when={access().failed}>
            {(failed) => (
              <text fg={color("feedback.warning")}>
                {`The review failed: ${failed()}. No one checked this request.`}
              </text>
            )}
          </Show>
        </Choose>
      )}
    </Show>
  );
}
