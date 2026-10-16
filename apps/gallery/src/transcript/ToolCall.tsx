/**
 * A tool call at a level: `line` is the call on one line, open to its block when asked or when the
 * call failed; `full` is always open; `live` is the bare line, for the turn's current action. A
 * running call reads in the present tense.
 */

import { Match, Show, Switch } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import type { ToolCall as Call } from "./entries.ts";
import type { DrawnLevel } from "./levels.ts";
import type { ToolFace } from "./results/face.ts";
import { faceOf } from "./results/faceOf.ts";
import { Panel } from "./results/Panel.tsx";
import { Output } from "./results/run.tsx";
import { StatusLabel } from "./StatusLabel.tsx";

export function CallLine(props: {
  readonly color: RoleColor;
  readonly call: Call;
  readonly face: ToolFace;
  readonly isLive: boolean;
}) {
  const isRunning = () => props.call.outcome.status === "running";
  const summary = () => (props.isLive ? undefined : props.face.result?.summary);

  return (
    <box flexDirection="row" height={1} gap={1}>
      <StatusLabel
        color={props.color}
        status={props.call.outcome.status}
        label={isRunning() ? props.face.activeVerb : props.face.verb}
      />
      <Show when={props.face.subject !== ""}>
        <text wrapMode="none" truncate flexShrink={1} fg={props.color("text.muted")}>
          {props.face.subject}
        </text>
      </Show>
      <Show when={summary()}>
        {(shown) => (
          <text wrapMode="none" flexShrink={0} fg={props.color("text.faint")}>
            {shown()}
          </text>
        )}
      </Show>
    </box>
  );
}

/** What the block opens to: the error and output of a failure, else the result or the wait. */
function CallBody(props: {
  readonly color: RoleColor;
  readonly call: Call;
  readonly face: ToolFace;
}) {
  return (
    <Switch>
      <Match when={props.call.outcome.status === "failed" ? props.call.outcome : undefined}>
        {(failure) => (
          <Panel color={props.color}>
            <text fg={props.color("feedback.danger")}>{failure().error}</text>
            <Output color={props.color} lines={failure().output} />
          </Panel>
        )}
      </Match>
      <Match when={props.face.result}>{(result) => result().body(props.color)}</Match>
      <Match when={props.face.waitingBody}>{(waiting) => waiting()(props.color)}</Match>
    </Switch>
  );
}

export function ToolCall(props: {
  readonly color: RoleColor;
  readonly call: Call;
  readonly level: DrawnLevel;
  readonly isOpen: boolean;
}) {
  const face = () => faceOf(props.call);
  const isFailed = () => props.call.outcome.status === "failed";

  const showsBody = () =>
    props.level === "full" || (props.level === "line" && (props.isOpen || isFailed()));

  return (
    <box flexDirection="column">
      <CallLine
        color={props.color}
        call={props.call}
        face={face()}
        isLive={props.level === "live"}
      />
      <Show when={showsBody()}>
        <CallBody color={props.color} call={props.call} face={face()} />
      </Show>
    </box>
  );
}
