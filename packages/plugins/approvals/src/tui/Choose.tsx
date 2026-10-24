/**
 * The frame both approval asks share: a title, the ask's body, then Approve and Reject as rows the
 * cursor moves through, as the kit's `Choices`. On Reject a note opens under it for telling the
 * model why. Up and down choose, enter sends, esc on Approve moves to Reject and on Reject cancels
 * the turn.
 */

import type { BoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import type { JSX } from "@opentui/solid";
import { Schema } from "effect";
import { createEffect, createSignal } from "solid-js";

import { Ask, type AskProps, moreAside, Note } from "@shanepadgett/liminal-questions/tui";
import { type Command, keymapCommand, kit, useHintsWithin } from "@shanepadgett/liminal-tui";

import { Answer } from "../contract.ts";

/** Where the cursor is: on Approve, or on Reject with the note written so far. */
type Cursor = { readonly kind: "approve" } | { readonly kind: "reject"; readonly note: string };

const CHOICES: ReadonlyArray<kit.Choice> = [
  { label: "Approve", hint: "approve" },
  { label: "Reject", hint: "reject" },
];

const APPROVE: Cursor = { kind: "approve" };

const REJECT: Cursor = { kind: "reject", note: "" };

const encodeAnswer = Schema.encodeSync(Schema.toCodecJson(Answer));

const answerOf = (cursor: Cursor): Answer => {
  if (cursor.kind === "approve") return { decision: "approve" };

  const note = cursor.note.trim();

  return note === "" ? { decision: "reject" } : { decision: "reject", note };
};

const KEYS = [
  { key: "escape", cmd: "approvals.to-reject" },
  { key: "escape", cmd: "approvals.cancel" },
];

/** Esc: on Approve it moves to Reject, on Reject it cancels the turn. */
const escapeCommands = (
  cursor: () => Cursor,
  setCursor: (cursor: Cursor) => void,
  props: AskProps,
): Command[] => {
  const isApprove = () => cursor().kind === "approve";

  return [
    {
      name: "approvals.to-reject",
      title: "Reject",
      hint: { label: "reject" },
      enabled: isApprove,
      run: () => {
        setCursor(REJECT);
      },
    },
    {
      name: "approvals.cancel",
      title: "Cancel",
      hint: { label: "cancel" },
      enabled: () => !isApprove(),
      run: props.cancel,
    },
  ];
};

export function Choose(
  props: AskProps & { readonly title: string; readonly children: JSX.Element },
) {
  const [cursor, setCursor] = createSignal<Cursor>(APPROVE);

  const note = () => {
    const current = cursor();

    return current.kind === "reject" ? current.note : undefined;
  };

  let root: BoxRenderable | undefined;

  useBindings(() => ({
    target: () => root,
    commands: escapeCommands(cursor, setCursor, props).map(keymapCommand),
    bindings: KEYS,
  }));

  const hints = useHintsWithin(() => root);

  // On Approve the ask holds focus; on Reject the note's field takes it.
  createEffect(() => {
    if (cursor().kind === "approve") root?.focus();
  });

  return (
    <box
      ref={(made) => {
        root = made;
      }}
      focusable
      flexShrink={0}
      paddingX={2}
      paddingTop={1}
    >
      <Ask mark="△" markRole="feedback.warning" title={props.title} aside={moreAside(props.more)}>
        {props.children}
        <box marginTop={1}>
          <kit.Choices
            choices={CHOICES}
            under={cursor().kind === "approve" ? 0 : 1}
            target={() => root}
            onMove={(index) => {
              setCursor(index === 0 ? APPROVE : REJECT);
            }}
            onPick={() => {
              props.answer(encodeAnswer(answerOf(cursor())));
            }}
          />
          <Note
            note={note()}
            isWriting={note() !== undefined}
            placeholder="Tell the model why (optional)"
            indent={kit.POINTER_COLUMNS}
            onInput={(text) => {
              setCursor({ kind: "reject", note: text });
            }}
          />
        </box>
      </Ask>
      <box marginTop={1}>
        <kit.Hints hints={hints()} end />
      </box>
    </box>
  );
}
