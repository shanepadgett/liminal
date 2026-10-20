/**
 * Approval's TUI part: the mode label after the composer's model line, shift+tab and `/approvals`
 * to change the session's mode, the approval prompt for the oldest waiting ask in the composer's
 * draft area and key hints at the top priority, and each saved answer in the debug view.
 */

import { Effect, Option, Stream } from "effect";
import { createSignal } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  type Hint,
  makeBridge,
  SelectDialog,
  type SelectOption,
  TuiCommands,
  TuiDialogs,
  TuiHost,
  TuiInputWaits,
} from "@liminal/sdk/tui";

import { type ApprovalMode, ApprovalEntry, ApprovalRpcs, type PendingAsk } from "./contract.ts";
import { AnswerRow } from "./tui/AnswerRow.tsx";
import { type PromptDeps, registerPrompt } from "./tui/ApprovalPrompt.tsx";
import { trackAsks } from "./tui/input-waits.ts";
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

/** Opens the mode dialog for the session on screen. */
const chooseMode = (
  dialogs: TuiDialogs["Service"],
  session: SessionId | undefined,
  setMode: LabelDeps["setMode"],
) => {
  if (session === undefined) return;

  dialogs.show((dialog) => (
    <SelectDialog
      close={dialog.close}
      title="Approval mode"
      options={modeOptions}
      onSelect={(mode) => {
        setMode(session, mode);
      }}
    />
  ));
};

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const client = yield* host.client(ApprovalRpcs);
    const inputWaits = yield* TuiInputWaits;
    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();
    const [pending, setPending] = createSignal<ReadonlyArray<PendingAsk>>([]);
    const [hints, setHints] = createSignal<ReadonlyArray<Hint>>([]);

    const deps: LabelDeps = {
      mode: (session) =>
        bridge.watch(
          client["approval/mode"]({ session }).pipe(Stream.map(Option.some)),
          Option.none<ApprovalMode>(),
        ),
      pending: (session) =>
        bridge.watch(trackAsks(client["approval/pending"]({ session }), inputWaits), []),
      setMode: (session, mode) => {
        bridge.run(client["approval/set-mode"]({ session, mode }));
      },
      setPending,
      onScreen: setOnScreen,
    };

    const promptDeps: PromptDeps = {
      pending,
      answer: (id, approve, note) => {
        bridge.run(client["approval/answer"]({ id, approve, note }));
      },
      setHints,
      dialogOpen: () => dialogs.top() !== undefined,
    };

    yield* commands.register([
      {
        name: "approvals.mode",
        title: "Approvals",
        desc: "Choose how this session's tool calls are approved",
        category: "Session",
        slash: { name: "approvals" },
        palette: true,
        run: () => {
          chooseMode(dialogs, onScreen(), deps.setMode);
        },
      },
    ]);

    yield* host.register(ChatSlots.entry, { key: ApprovalEntry.kind, meta: {} }, AnswerRow);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "approval", order: 10 },
      makeModeLabel(deps),
    );

    yield* registerPrompt(host, promptDeps, hints);
  }),
});
