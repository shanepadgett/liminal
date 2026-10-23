/**
 * The session picker's `tui` entry: `ctrl+o` and `/sessions` list this folder's saved sessions,
 * latest first, under Today, Yesterday and Earlier. Enter shows the pick on the chat screen. Both
 * act while the draft has focus.
 */
import { DateTime, Effect, Layer } from "effect";

import { ChatScreen } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import { SessionId, SessionRpc, type SessionSummary } from "@shanepadgett/liminal-session/contract";
import {
  Dialogs,
  type kit,
  Keymap,
  makeEntryRun,
  openPicker,
  Pickers,
} from "@shanepadgett/liminal-tui";

import { whenOf } from "./when.ts";

const list = Effect.scoped(
  Effect.flatMap(Host, (host) =>
    Effect.flatMap(host.client(SessionRpc), (sessions) => sessions["session/list"]()),
  ),
);

const rowOf = (session: SessionSummary, now: DateTime.Utc): kit.PickerRow => {
  const { section, detail } = whenOf(session.updatedAt, now);

  return { id: session.id, title: session.title, detail, section };
};

const openSessions = (chat: ChatScreen["Service"]) =>
  Effect.gen(function* () {
    const sessions = yield* list;
    const now = yield* DateTime.now;
    const rows = sessions.map((session) => rowOf(session, now));

    yield* openPicker({
      name: "session-picker/sessions",
      title: "Sessions",
      placeholder: "Search sessions",
      empty: "No saved sessions in this folder",
      rows: () => rows,
      initial: chat.session(),
      actions: [],
      onSelect: (row) => {
        chat.show(SessionId.make(row.id));
      },
    });
  });

const make = Effect.gen(function* () {
  const chat = yield* ChatScreen;
  const run = yield* makeEntryRun("The session list failed.");

  yield* chat.registerDraftCommands(
    [
      {
        name: "session-picker.open",
        title: "Open a session",
        category: "Session",
        slash: { name: "sessions" },
        run: () => {
          run(openSessions(chat));
        },
      },
    ],
    [{ key: "ctrl+o", cmd: "session-picker.open" }],
  );
});

export default definePlugin({
  name: "session-picker-tui",
  provides: [],
  requires: [Host, Keymap, Dialogs, Pickers, ChatScreen],
  layer: Layer.effectDiscard(make),
});
