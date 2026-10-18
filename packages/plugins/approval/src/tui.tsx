/**
 * Approval's TUI part: the mode label after the composer's model line, shift+tab and `/approvals`
 * to change the session's mode, the dialog for each waiting ask, and each saved answer in the debug
 * view.
 */

import { Effect, Option, Stream } from "effect";
import { createSignal } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  makeBridge,
  SelectDialog,
  type SelectOption,
  TuiCommands,
  TuiDialogs,
  TuiHost,
} from "@liminal/sdk/tui";

import { type ApprovalMode, ApprovalEntry, ApprovalRpcs } from "./contract.ts";
import { AnswerRow } from "./tui/AnswerRow.tsx";
import { type LabelDeps, makeModeLabel } from "./tui/ModeLabel.tsx";

const modeOptions: ReadonlyArray<SelectOption<ApprovalMode>> = [
  {
    title: "auto",
    value: "auto",
    description: "Safe calls run; a decision model and a reviewer approve the rest or ask you",
  },
  { title: "ask", value: "ask", description: "Safe calls run; every other call asks you" },
  { title: "full", value: "full", description: "Every call runs without asking" },
];

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const client = yield* host.client(ApprovalRpcs);
    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();

    const deps: LabelDeps = {
      mode: (session) =>
        bridge.watch(
          client["approval/mode"]({ session }).pipe(Stream.map(Option.some)),
          Option.none<ApprovalMode>(),
        ),
      pending: (session) => bridge.watch(client["approval/pending"]({ session }), []),
      setMode: (session, mode) => {
        bridge.run(client["approval/set-mode"]({ session, mode }));
      },
      answer: (id, approve, note) => {
        bridge.run(client["approval/answer"]({ id, approve, note }));
      },
      show: dialogs.show,
      onScreen: setOnScreen,
    };

    const chooseMode = () => {
      const session = onScreen();
      if (session === undefined) return;

      dialogs.show((dialog) => (
        <SelectDialog
          close={dialog.close}
          title="Approval mode"
          options={modeOptions}
          onSelect={(mode) => {
            deps.setMode(session, mode);
          }}
        />
      ));
    };

    yield* commands.register([
      {
        name: "approval.mode",
        title: "Approval mode",
        desc: "Choose how this session's tool calls are approved",
        category: "Session",
        slash: { name: "approvals" },
        palette: true,
        run: chooseMode,
      },
    ]);

    yield* host.register(ChatSlots.entry, { key: ApprovalEntry.kind, meta: {} }, AnswerRow);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "approval", order: 10 },
      makeModeLabel(deps),
    );
  }),
});
