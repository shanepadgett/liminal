/** Everything the gallery shows, in review order: tokens first, scenarios last. */

import { ChatHeader } from "./chat/ChatHeader.tsx";
import { ChatScreen, type GlideAt } from "./chat/ChatScreen.tsx";
import { CommandPalette } from "./chat/CommandPalette.tsx";
import { Composer } from "./chat/Composer.tsx";
import {
  FORM_CHOOSING,
  FORM_CONFIRMING,
  FORM_CONTEXT,
  FORM_SKIPPING,
  FORM_NOTING,
  FORM_OWN,
  FORM_WRITING,
} from "./chat/formSamples.ts";
import type { FormState } from "./chat/formState.ts";
import { ModelPicker, ThinkingPicker } from "./chat/ModelPicker.tsx";
import type { ReloadShown } from "./chat/ReloadStatus.tsx";
import { Sidebar } from "./chat/Sidebar.tsx";
import { Toast, type ToastKind, type ToastMessage } from "./chat/Toast.tsx";
import { only, withRoles } from "./entryViews.ts";
import { PRIMITIVES } from "./primitives.tsx";
import type { EntryState, Groups } from "./shell/entries.ts";
import { PaletteView } from "./tokens/PaletteView.tsx";
import { TerminalView } from "./tokens/TerminalView.tsx";
import { TRANSCRIPT_COMPONENTS, TRANSCRIPT_SCREENS } from "./transcript/galleryEntries.tsx";

/** A draft long enough to show how the composer holds real text. */
const DRAFT = "fix the test so it checks they start concurrently";

const composerState = (name: string, isWorking: boolean, draft: string): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <Composer
      color={color}
      model="claude-opus-4"
      thinking="high"
      draft={draft}
      isWorking={isWorking}
      isGliding={isWorking}
      form={undefined}
    />
  )),
});

/** The composer taken over by the assistant's questions. */
const questionsState = (name: string, form: FormState): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <Composer
      color={color}
      model="claude-opus-4"
      thinking="high"
      draft=""
      isWorking={false}
      isGliding={false}
      form={form}
    />
  )),
});

const headerState = (name: string, isWorking: boolean, reload?: ReloadShown): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <ChatHeader
      color={color}
      title="Explain how the plugin host boots"
      isWorking={isWorking}
      {...(reload === undefined ? {} : { reload })}
    />
  )),
});

/** A failed check's reason, as the typecheck reports it. */
const TYPECHECK_FAILED =
  "packages/plugins/inbox/src/server.ts(42,7): error TS2322: Type 'string' is not assignable to type 'number'.";

type ChatOptions = {
  readonly isWorking: boolean;
  readonly glideAt: GlideAt;
  readonly isSidebarOpen: boolean;
  readonly isCommandsOpen: boolean;
  readonly toast?: ToastMessage;
};

const TOASTS: Readonly<Record<ToastKind, ToastMessage>> = {
  error: {
    kind: "error",
    title: "Couldn't reach the model",
    message: "The provider returned 529 (overloaded). Retrying in 8s.",
  },
  warning: {
    kind: "warning",
    title: "Context is 90% full",
    message: "Compact soon to keep the whole conversation.",
  },
  success: { kind: "success", title: "Session exported", message: "docs/sessions/plugin-host.md" },
  info: { kind: "info", title: "Theme changed to Afterhours" },
};

const toastState = (kind: ToastKind): EntryState => ({
  name: kind.charAt(0).toUpperCase() + kind.slice(1),
  fill: "content",
  view: withRoles((color) => <Toast color={color} toast={TOASTS[kind]} />),
});

const chatState = (name: string, options: ChatOptions): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <ChatScreen color={color} {...options} />),
});

const commandsState = (name: string, selected: string): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <CommandPalette color={color} selected={selected} />),
});

const modelsState = (name: string, selected: string): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <ModelPicker color={color} selected={selected} />),
});

const thinkingState = (name: string, selected: string): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <ThinkingPicker color={color} selected={selected} />),
});

export const GROUPS: Groups = [
  {
    title: "Tokens",
    sections: [
      {
        title: "Palettes",
        entries: [
          {
            id: "palette",
            title: "Palette",
            states: only("page", (palette) => <PaletteView palette={palette} />),
          },
          { id: "terminal", title: "Terminal", states: only("page", () => <TerminalView />) },
        ],
      },
    ],
  },
  PRIMITIVES,
  {
    title: "Components",
    sections: [
      {
        title: "Chat",
        entries: [
          {
            id: "header",
            title: "Header",
            states: [
              headerState("Idle", false),
              headerState("Working", true),
              headerState("Reload ready", false, { kind: "ready", restart: false }),
              headerState("Restart ready", false, { kind: "ready", restart: true }),
              headerState("Reload failed", false, { kind: "failed", reason: TYPECHECK_FAILED }),
            ],
          },
          {
            id: "composer",
            title: "Composer",
            states: [
              composerState("Idle, empty", false, ""),
              composerState("Idle, with text", false, DRAFT),
              composerState("Working", true, ""),
              composerState("Working, with text", true, DRAFT),
              composerState("Slash commands", false, "/"),
              composerState("Slash commands, filtered", false, "/co"),
              composerState("File tags", false, "explain how @"),
              composerState("File tags, filtered", false, "explain how @plug"),
              questionsState("Questions, choosing", FORM_CHOOSING),
              questionsState("Questions, writing a note", FORM_NOTING),
              questionsState("Questions, yes or no", FORM_CONFIRMING),
              questionsState("Questions, written answer", FORM_WRITING),
              questionsState("Questions, own answer", FORM_OWN),
              questionsState("Questions, additional context", FORM_CONTEXT),
              questionsState("Questions, one skipped", FORM_SKIPPING),
            ],
          },
          {
            id: "sidebar",
            title: "Sidebar",
            states: only(
              "content",
              withRoles((color) => <Sidebar color={color} />),
            ),
          },
          {
            id: "toast",
            title: "Toast",
            states: [
              toastState("error"),
              toastState("warning"),
              toastState("success"),
              toastState("info"),
            ],
          },
        ],
      },
      TRANSCRIPT_COMPONENTS,
      {
        title: "Dialogs",
        entries: [
          {
            id: "commands",
            title: "Commands",
            states: [
              commandsState("First command", "session.new"),
              commandsState("Later section", "view.sidebar"),
            ],
          },
          {
            id: "models",
            title: "Models",
            states: [
              modelsState("Current model", "gpt-5.5"),
              modelsState("Another provider", "claude-sonnet-4-6"),
              thinkingState("Thinking options", "medium"),
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Screens",
    sections: [
      {
        title: "Chat",
        entries: [
          {
            id: "chat",
            title: "Chat",
            states: [
              chatState("Working, header glides", {
                isWorking: true,
                glideAt: "header",
                isSidebarOpen: true,
                isCommandsOpen: false,
              }),
              chatState("Working, composer glides", {
                isWorking: true,
                glideAt: "composer",
                isSidebarOpen: true,
                isCommandsOpen: false,
              }),
              chatState("Idle", {
                isWorking: false,
                glideAt: "header",
                isSidebarOpen: true,
                isCommandsOpen: false,
              }),
              chatState("Working, sidebar closed", {
                isWorking: true,
                glideAt: "header",
                isSidebarOpen: false,
                isCommandsOpen: false,
              }),
              chatState("Error toast", {
                isWorking: true,
                glideAt: "header",
                isSidebarOpen: true,
                isCommandsOpen: false,
                toast: TOASTS.error,
              }),
              chatState("Commands open", {
                isWorking: false,
                glideAt: "header",
                isSidebarOpen: true,
                isCommandsOpen: true,
              }),
            ],
          },
        ],
      },
      TRANSCRIPT_SCREENS,
    ],
  },
  { title: "Scenarios", sections: [] },
];
