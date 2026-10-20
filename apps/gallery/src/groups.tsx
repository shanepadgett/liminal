/** Everything the gallery shows, in review order: tokens first, scenarios last. */

import type { JSX } from "@opentui/solid";

import { ChatHeader, type RoleColor } from "@liminal/sdk/tui";

import { type ApprovalAsk, ApprovalPrompt } from "./chat/ApprovalPrompt.tsx";
import { ChatScreen, type GlideAt } from "./chat/ChatScreen.tsx";
import { CommandPalette } from "./chat/CommandPalette.tsx";
import { COMMIT_PLAN, COMMIT_STATES, CommitPrompt, PUSH_QUESTION } from "./chat/CommitPrompt.tsx";
import { Composer } from "./chat/Composer.tsx";
import { CONNECT_STATES } from "./chat/connectStates.tsx";
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
import type { ApprovalMode } from "./chat/ModelLine.tsx";
import { ModelPicker, ThinkingPicker } from "./chat/ModelPicker.tsx";
import { NO_CLONES, ReferencesPicker } from "./chat/ReferencesPicker.tsx";
import type { ReloadShown } from "./chat/ReloadStatus.tsx";
import { SessionPicker } from "./chat/SessionPicker.tsx";
import { Sidebar } from "./chat/Sidebar.tsx";
import { StashPicker } from "./chat/StashPicker.tsx";
import { Toast, type ToastMessage } from "./chat/Toast.tsx";
import { TrustPrompt } from "./chat/TrustPrompt.tsx";
import { only, withRoles } from "./entryViews.ts";
import { PRIMITIVES } from "./primitives.tsx";
import type { EntryState, Groups } from "./shell/entries.ts";
import { PaletteView } from "./tokens/PaletteView.tsx";
import { TerminalView } from "./tokens/TerminalView.tsx";
import { TRANSCRIPT_COMPONENTS, TRANSCRIPT_SCREENS } from "./transcript/galleryEntries.tsx";
import type { NoticeKind } from "./transcript/Notice.tsx";

/** A draft long enough to show how the composer holds real text. */
const DRAFT = "fix the test so it checks they start concurrently";

/** A draft long enough that the input grows past its two rows. */
const LINES = [
  "the reload check fails on a fresh clone:",
  "",
  "1. run mise run dev",
  "2. edit a plugin's server file",
  "3. the header says the check failed",
].join("\n");

const composerState = (
  name: string,
  isWorking: boolean,
  draft: string,
  { approval = "auto", reload }: { approval?: ApprovalMode; reload?: ReloadShown } = {},
): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <Composer
      color={color}
      model="claude-opus-4"
      thinking="high"
      approval={approval}
      draft={draft}
      isWorking={isWorking}
      isGliding={isWorking}
      form={undefined}
      {...(reload === undefined ? {} : { reload })}
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
      approval="auto"
      draft=""
      isWorking={false}
      isGliding={false}
      form={form}
    />
  )),
});

/** The trust prompt, with the reason its save failed when it did. */
const trustState = (name: string, problem: string): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <TrustPrompt color={color} workspace="/Users/shane/dev/plugin-host" problem={problem} />
  )),
});

const headerState = (
  name: string,
  isWorking: boolean,
  title = "Explain how the plugin host boots",
): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => <ChatHeader color={color} title={title} isWorking={isWorking} />),
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
  readonly prompt?: (color: RoleColor) => JSX.Element;
};

const TOASTS: Readonly<Record<NoticeKind, ToastMessage>> = {
  error: {
    kind: "error",
    title: "Couldn't export the session",
    message: "docs/sessions is read-only.",
  },
  warning: {
    kind: "warning",
    title: "Nothing to undo",
    message: "The last turn made no file changes.",
  },
  success: { kind: "success", title: "Session exported", message: "docs/sessions/plugin-host.md" },
  info: { kind: "info", title: "Debug view on", message: "Debug entries show in the transcript." },
};

const toastState = (kind: NoticeKind): EntryState => ({
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

const modelsState = (name: string, selected: string, hasFailure = false): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => (
    <ModelPicker color={color} selected={selected} hasFailure={hasFailure} />
  )),
});

/** A shell call the reviewer explained, and a write it had nothing to add to. */
const SHELL_ASK: ApprovalAsk = {
  tool: "shell",
  subject: "rm -rf node_modules dist && bun install",
  reason: "the command is not on the safe list",
  summary:
    "Deletes the installed packages and the build output, then installs the packages again. Nothing outside the workspace changes.",
};

const WRITE_ASK: ApprovalAsk = {
  tool: "write",
  subject: "~/.zshrc",
  reason: "it changes ~/.zshrc, outside the workspace",
};

const approvalState = (
  name: string,
  ask: ApprovalAsk,
  isRejecting: boolean,
  { waiting = 0, note = "" }: { waiting?: number; note?: string } = {},
): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <ApprovalPrompt
      color={color}
      approval="ask"
      ask={ask}
      waiting={waiting}
      isRejecting={isRejecting}
      note={note}
    />
  )),
});

/** A chat screen with a custom prompt in the composer's place, held mid-turn. */
const promptScreenState = (name: string, prompt: NonNullable<ChatOptions["prompt"]>): EntryState =>
  chatState(name, {
    isWorking: true,
    glideAt: "composer",
    isSidebarOpen: true,
    isCommandsOpen: false,
    prompt,
  });

const sessionsState = (
  name: string,
  view: "active" | "archived",
  selected: string,
): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <SessionPicker color={color} view={view} selected={selected} />),
});

const emptySessionsState = (view: "active" | "archived"): EntryState => ({
  name: view === "active" ? "No active sessions" : "No archived sessions",
  fill: "screen",
  view: withRoles((color) => <SessionPicker color={color} view={view} selected="" sessions={[]} />),
});

const stashesState = (name: string, selected: number): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <StashPicker color={color} selected={selected} />),
});

const REFERENCES_STATES: readonly [EntryState, ...EntryState[]] = [
  {
    name: "Attached and cloning",
    fill: "screen",
    view: withRoles((color) => (
      <ReferencesPicker color={color} marked={["effect", "lipgloss"]} selected="opencode" />
    )),
  },
  {
    name: "No references",
    fill: "screen",
    view: withRoles((color) => (
      <ReferencesPicker color={color} marked={[]} selected="" clones={NO_CLONES} />
    )),
  },
];

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
              headerState("New session, no title", false, ""),
            ],
          },
          {
            id: "composer",
            title: "Composer",
            states: [
              composerState("Idle, empty", false, ""),
              composerState("Idle, with text", false, DRAFT),
              composerState("Idle, several lines", false, LINES),
              composerState("Working", true, ""),
              composerState("Working, with text", true, DRAFT),
              composerState("Approval ask", false, "", { approval: "ask" }),
              composerState("Approval full", false, "", { approval: "full" }),
              composerState("Reload ready", false, "", {
                reload: { kind: "ready", restart: false },
              }),
              composerState("Restart ready", false, "", {
                reload: { kind: "ready", restart: true },
              }),
              composerState("Reload failed", false, "", {
                reload: { kind: "failed", reason: TYPECHECK_FAILED },
              }),
              composerState("Slash commands", false, "/"),
              composerState("Slash commands, filtered", false, "/co"),
              composerState("File tags", false, "explain how @"),
              composerState("File tags, filtered", false, "explain how @plug"),
              composerState("File tags, folder opened", false, "explain how @kernel/src/"),
              composerState("With a picture", false, "what's off in this layout? [Image 1] "),
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
            id: "trust",
            title: "Trust prompt",
            states: [
              trustState("Asking", ""),
              trustState(
                "Couldn't save",
                "EACCES: permission denied, open '/Users/shane/.liminal/plugins.json'",
              ),
            ],
          },
          {
            id: "approval-prompt",
            title: "Approval prompt",
            states: [
              approvalState("Reviewed command", SHELL_ASK, false),
              approvalState("Write outside the workspace", WRITE_ASK, false),
              approvalState("More asks waiting", SHELL_ASK, false, { waiting: 2 }),
              approvalState("Rejecting with a note", SHELL_ASK, true, {
                note: "keep dist, only reinstall",
              }),
            ],
          },
          { id: "commit-prompt", title: "Commit prompt", states: COMMIT_STATES },
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
              modelsState("A provider whose list failed", "failure:openrouter", true),
            ],
          },
          {
            id: "sessions",
            title: "Sessions",
            states: [
              sessionsState("Active", "active", "s4"),
              sessionsState("Active, long title", "active", "s1"),
              sessionsState("Archived", "archived", "a3"),
              sessionsState("Archived, long title", "archived", "a1"),
              emptySessionsState("active"),
              emptySessionsState("archived"),
            ],
          },
          {
            id: "stashes",
            title: "Stashes",
            states: [stashesState("Newest stash", 3), stashesState("An older stash", 1)],
          },
          { id: "references", title: "References", states: REFERENCES_STATES },
          { id: "connect", title: "Connect", states: CONNECT_STATES },
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
              promptScreenState("Approval prompt", (color) => (
                <ApprovalPrompt
                  color={color}
                  approval="ask"
                  ask={SHELL_ASK}
                  waiting={1}
                  isRejecting={false}
                  note=""
                />
              )),
              promptScreenState("Commit prompt, plan", (color) => (
                <CommitPrompt color={color} shown={COMMIT_PLAN} />
              )),
              promptScreenState("Commit prompt, push", (color) => (
                <CommitPrompt color={color} shown={PUSH_QUESTION} />
              )),
            ],
          },
        ],
      },
      TRANSCRIPT_SCREENS,
    ],
  },
  { title: "Scenarios", sections: [] },
];
