/**
 * Stash's `tui` entry. `ctrl+s` stashes the chat draft and clears it once saved; it acts only while
 * the draft has text and focus. `/pop` opens the stashes picker while there are stashes: enter puts
 * the stash after the draft and drops it, `ctrl+d` asks, then drops it.
 */
import { Effect, Layer } from "effect";
import { type Accessor, createSignal } from "solid-js";

import { ChatScreen } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  Dialogs,
  type EntryRun,
  type kit,
  Keymap,
  makeEntryRun,
  Notifications,
  openPicker,
  Pickers,
  registerCommands,
} from "@shanepadgett/liminal-tui";

import { type Stash, StashRpc } from "../contract.ts";

const client = Effect.flatMap(Host, (host) => host.client(StashRpc));

const save = (text: string, marks: ReadonlyArray<string>) =>
  Effect.scoped(Effect.flatMap(client, (stashes) => stashes["stash/save"]({ text, marks })));

const list = Effect.scoped(Effect.flatMap(client, (stashes) => stashes["stash/list"]()));

const drop = (id: number) =>
  Effect.scoped(Effect.flatMap(client, (stashes) => stashes["stash/drop"]({ id })));

/** A stash as a picker row: its first line, and how many more lines it has. */
const rowOf = (stash: Stash): kit.PickerRow => {
  const [first = "", ...rest] = stash.text.split("\n");

  return rest.length === 0
    ? { id: String(stash.id), title: first }
    : { id: String(stash.id), title: first, detail: `+${rest.length} lines` };
};

/** The stashes as last read, and reading them again. */
interface Stashes {
  readonly list: Accessor<ReadonlyArray<Stash>>;
  readonly reload: Effect.Effect<void, Effect.Error<typeof list>, Host>;
}

/** Opens the stashes picker; its rows follow the list as stashes drop. */
const openStashes = (chat: ChatScreen["Service"], stashes: Stashes, run: EntryRun) =>
  Effect.gen(function* () {
    yield* stashes.reload;
    const stashOf = (id: string) => stashes.list().find((stash) => String(stash.id) === id);

    const dropThen = (id: string) => Effect.andThen(drop(Number(id)), stashes.reload);

    yield* openPicker({
      name: "stash/stashes",
      title: "Stashes",
      placeholder: "Search stashes",
      empty: "No stashes in this folder",
      rows: () => stashes.list().map(rowOf),
      actions: [
        {
          key: "ctrl+d",
          label: "drop",
          keepsOpen: true,
          confirm: { question: (row) => `Drop "${row.title}"?` },
          run: (row) => {
            run(dropThen(row.id));
          },
        },
      ],
      onSelect: (row) => {
        const picked = stashOf(row.id);
        if (picked === undefined) return;
        chat.draft.insert(picked.text, picked.marks);
        run(dropThen(row.id));
      },
    });
  });

const make = Effect.gen(function* () {
  const chat = yield* ChatScreen;
  const run = yield* makeEntryRun("Stash failed.");

  const [listed, setListed] = createSignal<ReadonlyArray<Stash>>([]);
  const stashes: Stashes = { list: listed, reload: Effect.map(list, (next) => setListed(next)) };

  const stash = () => {
    const text = chat.draft.text();

    run(
      Effect.andThen(
        save(text, chat.draft.marks()),
        Effect.andThen(
          Effect.sync(() => {
            chat.draft.clearIf(text);
          }),
          stashes.reload,
        ),
      ),
    );
  };

  run(stashes.reload);

  yield* chat.registerDraftCommands(
    [
      {
        name: "stash.save",
        title: "Stash draft",
        category: "Draft",
        hint: { label: "stash" },
        enabled: () => chat.draft.text() !== "",
        run: stash,
      },
    ],
    [{ key: "ctrl+s", cmd: "stash.save" }],
  );

  yield* registerCommands([
    {
      name: "stash.pop",
      title: "Stashed drafts",
      category: "Draft",
      slash: { name: "pop" },
      enabled: () => listed().length > 0,
      run: () => {
        run(openStashes(chat, stashes, run));
      },
    },
  ]);
});

export default definePlugin({
  name: "stash-tui",
  provides: [],
  requires: [Host, Keymap, Dialogs, Pickers, Notifications, ChatScreen],
  layer: Layer.effectDiscard(make),
});
