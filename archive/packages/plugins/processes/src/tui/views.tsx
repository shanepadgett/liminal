/**
 * How processes draw: an opened `process_start` row follows the command's last lines while it runs;
 * the sidebar's Processes section lists the session's commands, keeping ended ones a minute; a
 * notice is one muted line.
 */

import { Option, Predicate } from "effect";
import { type Accessor, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import type { ToolView } from "@liminal/chat/contract";
import type { SavedEntry, SessionId } from "@liminal/sdk";
import { type RoleName, SidebarSection, SidebarStat, Tail, useColor } from "@liminal/sdk/tui";

import type { ProcessSummary } from "../contract.ts";
import { stateWord, summaryOf } from "./rows.ts";

const TAIL_LINES = 12;
/** How long an ended command stays in the sidebar. */
const ENDED_KEPT_MS = 60_000;
const TICK_MS = 5000;

/** The command's last lines as they change, starting from `initial`. */
export type WatchOutput = (session: SessionId, id: string, initial: string) => Accessor<string>;

export type WatchList = (session: SessionId) => Accessor<ReadonlyArray<ProcessSummary>>;

/** An opened `process_start`: the command's live last lines, or the call's text before it has an id. */
export const makeStartDetail = (watch: WatchOutput) =>
  function StartDetail(props: ToolView & { readonly sessionId: SessionId }) {
    return Option.match(summaryOf(props.call), {
      onNone: () => <Tail text={props.text} lines={TAIL_LINES} />,
      onSome: (process) => {
        const output = watch(props.sessionId, process.id, props.text);

        return <Tail text={output()} lines={TAIL_LINES} />;
      },
    });
  };

/** Any other `process_*` call opened: its text's last lines. */
export function TextDetail(props: ToolView) {
  return <Tail text={props.text} lines={TAIL_LINES} />;
}

const toneOf = (process: ProcessSummary): RoleName => {
  if (Predicate.isTagged(process.state, "Running")) return "feedback.success";

  return Predicate.isTagged(process.state, "Exited") && process.state.code !== 0
    ? "feedback.danger"
    : "text.muted";
};

/** The commands to show: running ones, and ended ones first seen ended less than a minute ago. */
const recentOf = (list: Accessor<ReadonlyArray<ProcessSummary>>) => {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), TICK_MS);

  onCleanup(() => {
    clearInterval(timer);
  });

  const endedAt = new Map<string, number>();

  return createMemo(() =>
    list().filter((process) => {
      if (Predicate.isTagged(process.state, "Running")) return true;

      const at = endedAt.get(process.id) ?? Date.now();
      endedAt.set(process.id, at);

      return now() - at < ENDED_KEPT_MS;
    }),
  );
};

/** The sidebar's Processes section; nothing while the session has no recent command. */
export const makeSection = (watch: WatchList) =>
  function ProcessesSection(props: { readonly sessionId: SessionId }) {
    const recent = recentOf(watch(props.sessionId));

    return (
      <Show when={recent().length > 0}>
        <SidebarSection title="Processes">
          <For each={recent()}>
            {(process) => (
              <SidebarStat
                label={`${process.id} ${process.command}`}
                value={stateWord(process)}
                tone={toneOf(process)}
              />
            )}
          </For>
        </SidebarSection>
      </Show>
    );
  };

/** `◇ Command p1 (npm run dev) exited with code 0.`, muted. */
export function NoticeLine(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return (
    <text fg={color("text.muted")}>
      <span style={{ fg: color("text.ghost") }}>{"◇ "}</span>
      {props.entry.text}
    </text>
  );
}
