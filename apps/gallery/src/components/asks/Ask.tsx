/**
 * The frame of an ask, which takes the draft's place until the user answers: the composer's gutter
 * runs down its whole height, beside a title line and the ask's body. A note on the title line's
 * right says how many more asks wait. Fields inside an ask are one line on the raised surface.
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, Show } from "solid-js";

import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";
import { Gutter } from "../chat/Composer.tsx";

/** The note on the title line for `more` asks waiting after this one. */
export const moreAside = (more: number): string | undefined => {
  if (more === 0) return undefined;

  return more === 1 ? "1 more waiting" : `${more} more waiting`;
};

export function Ask(props: {
  /** One glyph before the title saying what kind of ask it is. */
  readonly mark: string;
  readonly markRole: RoleName;
  readonly title: string;
  readonly aside?: string | undefined;
  readonly children: JSX.Element;
}) {
  const color = useColor();
  const [rows, setRows] = createSignal(1);

  return (
    <box flexDirection="row">
      <Gutter rows={rows()} />
      <box
        flexGrow={1}
        onSizeChange={function () {
          setRows(this.height);
        }}
      >
        <box flexDirection="row" gap={2}>
          <text flexGrow={1} wrapMode="none" truncate>
            <span style={{ fg: color(props.markRole) }}>{`${props.mark} `}</span>
            <span style={{ fg: color("text.heading"), attributes: TextAttributes.BOLD }}>
              {props.title}
            </span>
          </text>
          <Show when={props.aside}>
            {(aside) => (
              <text flexShrink={0} fg={color("text.faint")}>
                {aside()}
              </text>
            )}
          </Show>
        </box>
        <box marginTop={1}>{props.children}</box>
      </box>
    </box>
  );
}

/** A one-line field on the raised surface. */
export function Field(props: { readonly value: string; readonly placeholder: string }) {
  const color = useColor();

  return (
    <input
      flexGrow={1}
      value={props.value}
      placeholder={props.placeholder}
      placeholderColor={color("text.ghost")}
      textColor={color("text.heading")}
      backgroundColor={color("surface.raised")}
      focusedBackgroundColor={color("surface.raised")}
      cursorColor={color("text.accent")}
    />
  );
}

/**
 * A note hanging under a row, from where the row's label starts so it reads as the row's own: the
 * field while it is written, else the note, else nothing.
 */
export function Note(props: {
  readonly note: string | undefined;
  readonly isWriting: boolean;
  readonly placeholder: string;
  /** Columns before the row's label. */
  readonly indent: number;
}) {
  const color = useColor();
  const lead = () => `${" ".repeat(props.indent)}└ `;

  return (
    <Show
      when={props.isWriting}
      fallback={
        <Show when={props.note}>
          {(note) => (
            <text>
              <span style={{ fg: color("text.ghost") }}>{lead()}</span>
              <span style={{ fg: color("text.muted") }}>{note()}</span>
            </text>
          )}
        </Show>
      }
    >
      <box flexDirection="row" height={1}>
        <text flexShrink={0} fg={color("text.ghost")}>
          {lead()}
        </text>
        <Field value={props.note ?? ""} placeholder={props.placeholder} />
      </box>
    </Show>
  );
}
