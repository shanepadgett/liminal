/**
 * The composer's slash commands: the menu's matches and highlight while the draft is `/word`, its
 * keys, and running a submitted `/name args` as the command it names.
 */

import type { TextareaRenderable } from "@opentui/core";
import { type Accessor, createEffect, createMemo, createSignal, on } from "solid-js";

import { enterKeys, slashCommand, type TuiCommandsService } from "@liminal/sdk/tui";

import { type SlashMatch, slashMatches, slashWord } from "./SlashMenu.tsx";

export interface SlashDeps {
  readonly commands: TuiCommandsService;
  readonly draft: Accessor<string>;
  readonly input: () => TextareaRenderable | undefined;
}

/** A submitted `/name args`: the name and the text after it. */
const typedCommand = (text: string) => /^\/(\S+)\s*([\s\S]*)$/.exec(text);

/** The menu's keys while it is open: up and down move, enter picks, tab completes the name. */
const slashKeys = (actions: {
  readonly move: (by: number) => void;
  readonly pick: () => void;
  readonly complete: () => void;
}) => ({
  commands: [
    {
      name: "inbox.slash-up",
      run: () => {
        actions.move(-1);
      },
    },
    {
      name: "inbox.slash-down",
      run: () => {
        actions.move(1);
      },
    },
    { name: "inbox.slash-pick", run: actions.pick },
    { name: "inbox.slash-complete", run: actions.complete },
  ],
  bindings: [
    { key: "up", cmd: "inbox.slash-up" },
    { key: "down", cmd: "inbox.slash-down" },
    ...enterKeys("inbox.slash-pick"),
    { key: "tab", cmd: "inbox.slash-complete" },
  ],
});

/** Esc clears a draft that is still a lone `/word`, with or without matches. */
const clearOf = (input: () => TextareaRenderable | undefined, typing: () => boolean) => ({
  clearCommand: {
    name: "inbox.slash-clear",
    run: () => {
      input()?.clear();
    },
  },
  clearKeys: () => (typing() ? [{ key: "escape", cmd: "inbox.slash-clear" }] : []),
});

export const useSlash = (deps: SlashDeps) => {
  const [selected, setSelected] = createSignal(0);

  const matches = createMemo((): ReadonlyArray<SlashMatch> => {
    const word = slashWord(deps.draft());

    return word === undefined ? [] : slashMatches(deps.commands.listed(), word);
  });

  // Boolean memos, so the keymap changes the menu's keys cause do not run them again.
  const open = createMemo(() => matches().length > 0);
  const typing = createMemo(() => slashWord(deps.draft()) !== undefined);

  createEffect(
    on(
      () => slashWord(deps.draft()),
      () => setSelected(0),
    ),
  );

  const fill = (name: string) => {
    const input = deps.input();
    input?.setText(`${name} `);
    input?.gotoBufferEnd();
  };

  const move = (by: number) => {
    const count = matches().length;
    if (count > 0) setSelected((index) => (index + by + count) % count);
  };

  const pick = () => {
    const match = matches()[selected()];
    if (match === undefined) return;

    if (match.command.slash?.arguments === true) {
      fill(match.name);

      return;
    }

    deps.input()?.clear();
    deps.commands.run(match.command.name, "");
  };

  /** Runs `text` as the command it names; false when it names none, so it is a prompt. */
  const submit = (text: string) => {
    const [, word = "", rest = ""] = typedCommand(text) ?? [];
    const command = slashCommand(deps.commands.listed(), word);
    if (command === undefined) return false;
    deps.commands.run(command.name, command.slash?.arguments === true ? rest : "");

    return true;
  };

  const complete = () => {
    const match = matches()[selected()];
    if (match !== undefined) fill(match.name);
  };

  const keys = slashKeys({ move, pick, complete });

  const clear = clearOf(deps.input, typing);

  return { matches, selected, open, submit, ...keys, ...clear };
};
