/**
 * Notices' contract: the notice entry kind and `notice()`, the draft a server plugin appends
 * through the session log. Writing a notice needs only this contract, so it saves with the plugin
 * off.
 */

import { Schema } from "effect";

import { defineEntry, draft, type EntryDraft } from "@liminal/sdk";

export const NoticeKind = Schema.Literals(["info", "success", "warning", "error"]);
export type NoticeKind = typeof NoticeKind.Type;

export const Notice = Schema.Struct({
  kind: NoticeKind,
  title: Schema.String,
  body: Schema.optionalKey(Schema.String),
});

export type Notice = typeof Notice.Type;

/** Saved and shown in the transcript; never sent to the model. */
export const NoticeEntry = defineEntry({
  kind: "notices/notice",
  data: Notice,
  model: false,
  user: "shown",
});

/** The notice as plain text: the title, a blank line, the body. */
export const noticeText = (value: Notice): string =>
  value.body === undefined ? value.title : `${value.title}\n\n${value.body}`;

/** The draft a server plugin appends; its text is the notice as plain text. */
export const notice = (value: Notice): EntryDraft<Notice> =>
  draft(NoticeEntry, { data: value, text: noticeText(value) });
