/**
 * The header item: `ctrl+r reload` (or `restart`) once a checked change waits, or `reload failed`
 * and the first line of the reason. Shows nothing otherwise.
 */

import { Predicate } from "effect";
import { Match, Switch } from "solid-js";

import type { ReloadState } from "@liminal/sdk";
import { Hints, type RoleColor } from "@liminal/sdk/tui";

/** The longest part of a failure reason the header shows. */
const REASON_COLUMNS = 48;

/** The reason's first line, cut to `REASON_COLUMNS`. */
export const shortReason = (reason: string) => {
  const [line = ""] = reason.trim().split("\n");

  return line.length > REASON_COLUMNS ? `${line.slice(0, REASON_COLUMNS - 1)}…` : line;
};

export function ReloadStatus(props: { readonly color: RoleColor; readonly state: ReloadState }) {
  const ready = () => (Predicate.isTagged(props.state, "Ready") ? props.state : undefined);
  const failed = () => (Predicate.isTagged(props.state, "Failed") ? props.state : undefined);

  return (
    <Switch>
      <Match when={ready()}>
        {(shown) => (
          <box flexShrink={0} paddingLeft={1}>
            <Hints
              color={props.color}
              hints={[["ctrl+r", shown().restart ? "restart" : "reload"]]}
            />
          </box>
        )}
      </Match>
      <Match when={failed()}>
        {(shown) => (
          <text wrapMode="none" flexShrink={0} paddingLeft={1}>
            <span style={{ fg: props.color("feedback.danger") }}>reload failed</span>
            <span
              style={{ fg: props.color("text.faint") }}
            >{` ${shortReason(shown().reason)}`}</span>
          </text>
        )}
      </Match>
    </Switch>
  );
}
