/**
 * A notice in the transcript about something that happened in the session: a model error, a skipped
 * instruction file, a nearly full context. Only the user sees it; the model never does. It sits
 * where it happened, between turns or inside one. A thin bar in the kind's color runs down its left
 * edge with no fill behind it, so it reads apart from the user's prompts. The title is bold in that
 * color with a copy button on the right that copies the title and body as plain text, then reads
 * "copied" for a moment; the body is muted beneath it.
 */

import { Show } from "solid-js";

import { type RoleColor, type RoleName, useCopy } from "@liminal/sdk/tui";

export type NoticeKind = "info" | "success" | "warning" | "error";

export type NoticeMessage = {
  readonly kind: NoticeKind;
  readonly title: string;
  readonly body?: string;
};

/** The color of each kind, shared with toasts. */
export const NOTICE_ROLES: Readonly<Record<NoticeKind, RoleName>> = {
  info: "feedback.info",
  success: "feedback.success",
  warning: "feedback.warning",
  error: "feedback.danger",
};

/** The mark that leads each kind's title. */
const NOTICE_MARKS: Readonly<Record<NoticeKind, string>> = {
  info: "●",
  success: "✓",
  warning: "▲",
  error: "✕",
};

/** The body sits under the title's words, past the mark and its space. */
const BODY_INDENT = 2;

/** Each kind's color in the transcript, dimmer than the assistant's words. */
const NOTICE_DIM_ROLES: Readonly<Record<NoticeKind, RoleName>> = {
  info: "feedback.info.subtle",
  success: "feedback.success.subtle",
  warning: "feedback.warning.subtle",
  error: "feedback.danger.subtle",
};

/** The plain text the copy button puts on the clipboard: the title, a blank line, the body. */
export const noticeText = (notice: NoticeMessage): string =>
  notice.body === undefined ? notice.title : `${notice.title}\n\n${notice.body}`;

/** The notice as drawn; `isCopied` shows the button's "copied" moment. */
export function Notice(props: {
  readonly color: RoleColor;
  readonly notice: NoticeMessage;
  readonly isCopied: boolean;
  readonly onCopy: () => void;
}) {
  const accent = () => props.color(NOTICE_DIM_ROLES[props.notice.kind]);

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={2}>
        <text flexGrow={1} fg={accent()}>
          <span>{`${NOTICE_MARKS[props.notice.kind]} `}</span>
          <b>{props.notice.title}</b>
        </text>
        <text
          flexShrink={0}
          fg={props.color(props.isCopied ? "feedback.success.subtle" : "text.ghost")}
          onMouseUp={props.onCopy}
        >
          {props.isCopied ? "copied" : "copy"}
        </text>
      </box>
      <Show when={props.notice.body}>
        {(body) => (
          <box paddingLeft={BODY_INDENT}>
            <text fg={props.color("text.faint")}>{body()}</text>
          </box>
        )}
      </Show>
    </box>
  );
}

/** A notice whose copy button writes to the terminal's clipboard and reads "copied" for a moment. */
export function LiveNotice(props: { readonly color: RoleColor; readonly notice: NoticeMessage }) {
  const { isCopied, copy } = useCopy();

  return (
    <Notice
      color={props.color}
      notice={props.notice}
      isCopied={isCopied()}
      onCopy={() => {
        copy(noticeText(props.notice));
      }}
    />
  );
}
