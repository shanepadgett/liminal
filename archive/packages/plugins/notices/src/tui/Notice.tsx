/**
 * A notice entry: the kind's mark and bold title in the kind's subtle color, a copy button on the
 * right, the faint body indented beneath, all dimmer than the assistant's words. The button copies
 * the title and body as plain text, then reads "copied" for a moment.
 */

import { Option, Schema } from "effect";
import { Show } from "solid-js";

import type { SavedEntry } from "@liminal/sdk";
import { type RoleName, useColor, useCopy } from "@liminal/sdk/tui";

import { Notice, type NoticeKind, noticeText } from "../contract.ts";

/** Each kind's color and the mark that leads its title. */
const STYLES: Readonly<Record<NoticeKind, { readonly role: RoleName; readonly mark: string }>> = {
  info: { role: "feedback.info.subtle", mark: "●" },
  success: { role: "feedback.success.subtle", mark: "✓" },
  warning: { role: "feedback.warning.subtle", mark: "▲" },
  error: { role: "feedback.danger.subtle", mark: "✕" },
};

function NoticeBlock(props: { readonly notice: Notice }) {
  const color = useColor();
  const { isCopied, copy } = useCopy();
  const style = () => STYLES[props.notice.kind];

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={2}>
        <text flexGrow={1} fg={color(style().role)}>
          {style().mark} <b>{props.notice.title}</b>
        </text>
        <text
          flexShrink={0}
          onMouseUp={() => {
            copy(noticeText(props.notice));
          }}
          fg={color(isCopied() ? "feedback.success.subtle" : "text.ghost")}
        >
          {isCopied() ? "copied" : "copy"}
        </text>
      </box>
      <Show when={props.notice.body}>
        {(body) => (
          <text paddingLeft={2} fg={color("text.faint")}>
            {body()}
          </text>
        )}
      </Show>
    </box>
  );
}

const decodeNotice = Schema.decodeUnknownOption(Notice);

/** A notice entry; data that does not decode shows the entry's text. */
export function NoticeEntryView(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return Option.match(decodeNotice(props.entry.data), {
    onNone: () => <text fg={color("text.base")}>{props.entry.text}</text>,
    onSome: (notice) => <NoticeBlock notice={notice} />,
  });
}
