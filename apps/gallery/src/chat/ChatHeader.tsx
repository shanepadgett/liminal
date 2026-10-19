/**
 * The chat column's header: the wordmark, hairlines that fill the width and thicken into the fade,
 * then the session title. While the agent works, the fade glides along the hairlines and back. When
 * the title would squeeze the hairlines too short, it drops, and the wordmark and hairlines take
 * the whole row.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, Show } from "solid-js";

import { FADE, HeaderRule, type RoleColor, WORDMARK } from "@liminal/sdk/tui";

import { type ReloadShown, ReloadStatus } from "./ReloadStatus.tsx";

/** The wordmark and the space before the hairlines. */
const SHOWN_WORDMARK = `${WORDMARK} `;

/** The header's padding on each side. */
const PADDING_COLUMNS = 2;

/** The blank row above the header line, then the line. */
export const HEADER_ROWS = 2;

/** The shortest hairline the title may leave: the fade three times over. */
const MIN_TRACK_COLUMNS = FADE.length * 3;

export function ChatHeader(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly isWorking: boolean;
  /** A pending reload, shown at the right end. */
  readonly reload?: ReloadShown;
}) {
  const [row, setRow] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  const shownTitle = () => ` ${props.title}`;

  const hasTitle = () =>
    columns() - PADDING_COLUMNS * 2 - SHOWN_WORDMARK.length - shownTitle().length
    >= MIN_TRACK_COLUMNS;

  return (
    <box
      ref={setRow}
      flexDirection="row"
      flexShrink={0}
      paddingX={PADDING_COLUMNS}
      paddingTop={HEADER_ROWS - 1}
      onSizeChange={() => setColumns(row()?.width ?? 0)}
    >
      <text fg={props.color("text.accent")} flexShrink={0}>
        {SHOWN_WORDMARK}
      </text>
      <HeaderRule color={props.color} surface="surface.base" isWorking={props.isWorking} />
      <Show when={hasTitle()}>
        <text wrapMode="none" flexShrink={0} fg={props.color("text.base")}>
          {shownTitle()}
        </text>
      </Show>
      <Show when={props.reload}>
        {(reload) => <ReloadStatus color={props.color} reload={reload()} />}
      </Show>
    </box>
  );
}
