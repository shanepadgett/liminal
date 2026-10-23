/**
 * The menu a draft trigger opens: which trigger's token sits before the cursor, its rows for what
 * follows the trigger's character, the row under the cursor and the keys that pick one. A trigger
 * opens each time its token starts; `esc` keeps it closed until the cursor leaves that token.
 */
import type { TextareaRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { Effect } from "effect";
import { type Accessor, createMemo, createSignal, onMount } from "solid-js";

import { type Command, keymapCommand, useRun } from "@shanepadgett/liminal-tui";

import type {
  DraftKey,
  DraftRow,
  DraftToken,
  DraftTrigger,
  DraftTriggers,
  OpenTrigger,
} from "./triggers.ts";

interface Typing {
  readonly trigger: DraftTrigger;
  readonly token: DraftToken;
}

/**
 * The word before the cursor, if `trigger`'s character starts it where the trigger may open; else
 * none.
 */
const typingOf = (
  trigger: DraftTrigger,
  before: string,
  draft: TextareaRenderable,
): ReadonlyArray<Typing> => {
  const word = /\S*$/.exec(before)?.[0] ?? "";
  const index = before.length - word.length;
  const isPlaced = trigger.where === "any-word" || index === 0;
  if (!word.startsWith(trigger.char) || !isPlaced) return [];

  const start = draft.editBuffer.measureText(before.slice(0, index));
  const token = { query: word.slice(trigger.char.length), start, end: draft.cursorOffset };

  return [{ trigger, token }];
};

/** The open trigger, what it loaded, and the row under the cursor. */
const useMenuState = (registry: DraftTriggers["Service"]) => {
  const run = useRun();
  const [triggers, setTriggers] = createSignal<ReadonlyArray<DraftTrigger>>([]);
  const [typing, setTyping] = createSignal<Typing>();
  const [opened, setOpened] = createSignal<OpenTrigger>();
  const [under, setUnder] = createSignal(0);

  onMount(() => {
    run(Effect.map(registry.list, (list) => setTriggers(list)));
  });

  const rows = createMemo(() => {
    const token = typing()?.token;
    const loaded = opened();

    return token === undefined || loaded === undefined ? undefined : loaded.rows(token.query);
  });

  /** Opens the menu for `next`, or closes it with none; a newly opened trigger loads its rows. */
  const show = (next?: Typing) => {
    if (next !== undefined && typing()?.trigger !== next.trigger) {
      setOpened(undefined);
      run(Effect.map(next.trigger.open, (loaded) => setOpened(loaded)));
    }

    if (typing()?.token.query !== next?.token.query) setUnder(0);
    setTyping(next);
  };

  const move = (by: number) => {
    const count = rows()?.length ?? 0;
    if (count > 0) setUnder((index) => (index + by + count) % count);
  };

  return { triggers, typing, opened, rows, under, show, move };
};

type MenuState = ReturnType<typeof useMenuState>;

/**
 * Up and down, with more than one row to choose from, and esc while the menu is open. None has a
 * hint; every user expects them.
 */
const menuCommands = (menu: MenuState, dismiss: () => void): Command[] => {
  const canMove = () => (menu.rows()?.length ?? 0) > 1;

  return [
    {
      name: "chat.menu.up",
      title: "Previous row",
      enabled: canMove,
      run: () => {
        menu.move(-1);
      },
    },
    {
      name: "chat.menu.down",
      title: "Next row",
      enabled: canMove,
      run: () => {
        menu.move(1);
      },
    },
    {
      name: "chat.menu.close",
      title: "Close menu",
      enabled: () => menu.typing() !== undefined,
      run: dismiss,
    },
  ];
};

/** The open trigger's keys, each while the row under the cursor allows it. */
const triggerCommands = (
  menu: MenuState,
  keys: ReadonlyArray<DraftKey>,
  pick: (key: DraftKey) => void,
): Command[] =>
  keys.map((key, index) => {
    const command: Command = {
      name: `chat.menu.key.${index}`,
      title: key.title,
      enabled: () => {
        const row = menu.rows()?.[menu.under()];

        return menu.typing() !== undefined && row !== undefined && (key.enabled?.(row) ?? true);
      },
      run: () => {
        pick(key);
      },
    };

    return key.hint === undefined ? command : { ...command, hint: { label: key.hint } };
  });

/** Above the composer's own keys; active while the draft has focus. */
const useMenuKeys = (
  menu: MenuState,
  draft: () => TextareaRenderable | undefined,
  pick: (key: DraftKey) => void,
  dismiss: () => void,
) => {
  useBindings(() => {
    const keys = menu.opened()?.keys ?? [];

    return {
      target: draft,
      priority: 1,
      commands: [...menuCommands(menu, dismiss), ...triggerCommands(menu, keys, pick)].map(
        keymapCommand,
      ),
      bindings: [
        { key: "up", cmd: "chat.menu.up" },
        { key: "down", cmd: "chat.menu.down" },
        ...keys.map((key, index) => ({ key: key.key, cmd: `chat.menu.key.${index}` })),
        { key: "escape", cmd: "chat.menu.close" },
      ],
    };
  });
};

export interface DraftMenu {
  /** The matching rows; undefined while the menu is closed or loading. */
  readonly rows: Accessor<ReadonlyArray<DraftRow> | undefined>;
  readonly under: Accessor<number>;
  /** Shown when no row matches. */
  readonly empty: Accessor<string>;
  /** Opens, updates or closes the menu from the text before the cursor. */
  readonly refresh: () => void;
}

export const useDraftMenu = (
  draft: () => TextareaRenderable | undefined,
  registry: DraftTriggers["Service"],
): DraftMenu => {
  const menu = useMenuState(registry);

  // A key's edit moves the cursor midway, so `isEditing` stops the refreshes it causes.
  // `dismissed` is the start of the token `esc` closed.
  const edit: { isEditing: boolean; dismissed: number | undefined } = {
    isEditing: false,
    dismissed: undefined,
  };

  const refresh = () => {
    const input = draft();
    if (input === undefined || edit.isEditing) return;

    const before = input.getTextRange(0, input.cursorOffset);
    const found = menu.triggers().flatMap((each) => typingOf(each, before, input))[0];
    if (found === undefined) edit.dismissed = undefined;
    menu.show(found?.token.start === edit.dismissed ? undefined : found);
  };

  const pick = (key: DraftKey) => {
    const input = draft();
    const token = menu.typing()?.token;
    const row = menu.rows()?.[menu.under()];
    if (input === undefined || token === undefined || row === undefined) return;

    edit.isEditing = true;
    key.run(row, input, token);
    edit.isEditing = false;
    refresh();
  };

  useMenuKeys(menu, draft, pick, () => {
    edit.dismissed = menu.typing()?.token.start;
    menu.show();
  });

  return { rows: menu.rows, under: menu.under, empty: () => menu.opened()?.empty ?? "", refresh };
};
