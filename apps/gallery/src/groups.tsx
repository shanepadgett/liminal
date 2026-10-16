/** Everything the gallery shows, in review order: tokens first, scenarios last. */

import type { JSX } from "@opentui/solid";

import { ChatHeader } from "./chat/ChatHeader.tsx";
import { ChatScreen } from "./chat/ChatScreen.tsx";
import { Composer } from "./chat/Composer.tsx";
import { Conversation } from "./chat/Conversation.tsx";
import { GLIDE, type ScanMotion, SWEEP } from "./chat/scan.ts";
import { Sidebar } from "./chat/Sidebar.tsx";
import { OrnamentView } from "./ornament/OrnamentView.tsx";
import type { EntryState, Fill, Groups } from "./shell/entries.ts";
import { PaletteView } from "./tokens/PaletteView.tsx";
import { type RoleColor, resolveRoles } from "./tokens/roles.ts";
import { TerminalView } from "./tokens/TerminalView.tsx";

/** A draft long enough to show how the composer holds real text. */
const DRAFT = "fix the test so it checks they start concurrently";

/** The one state of an entry that has no others. */
const only = (fill: Fill, view: EntryState["view"]): readonly [EntryState] => [
  { name: "Default", fill, view },
];

/** A view drawn with the palette's roles. */
const withRoles =
  (draw: (color: RoleColor) => JSX.Element): EntryState["view"] =>
  (palette) =>
    draw(resolveRoles(palette));

const composerState = (
  name: string,
  isWorking: boolean,
  draft: string,
  motion: ScanMotion,
): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <Composer
      color={color}
      model="claude-opus-4"
      thinking="high"
      draft={draft}
      isWorking={isWorking}
      motion={motion}
    />
  )),
});

const headerState = (name: string, isWorking: boolean): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <ChatHeader color={color} title="Explain how the plugin host boots" isWorking={isWorking} />
  )),
});

const chatState = (name: string, isWorking: boolean, isSidebarOpen: boolean): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => (
    <ChatScreen color={color} isWorking={isWorking} isSidebarOpen={isSidebarOpen} />
  )),
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
  {
    title: "Primitives",
    sections: [
      {
        title: "Ornament",
        entries: [
          {
            id: "fade",
            title: "Fade",
            states: only(
              "page",
              withRoles((color) => <OrnamentView color={color} />),
            ),
          },
        ],
      },
    ],
  },
  {
    title: "Components",
    sections: [
      {
        title: "Chat",
        entries: [
          {
            id: "header",
            title: "Header",
            states: [headerState("Idle", false), headerState("Working", true)],
          },
          {
            id: "conversation",
            title: "Conversation",
            states: only(
              "width",
              withRoles((color) => <Conversation color={color} />),
            ),
          },
          {
            id: "composer",
            title: "Composer",
            states: [
              composerState("Idle, empty", false, "", GLIDE),
              composerState("Idle, with text", false, DRAFT, GLIDE),
              composerState("Working, glide", true, "", GLIDE),
              composerState("Working, glide, with text", true, DRAFT, GLIDE),
              composerState("Working, sweep", true, "", SWEEP),
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
              chatState("Working", true, true),
              chatState("Idle", false, true),
              chatState("Working, sidebar closed", true, false),
            ],
          },
        ],
      },
    ],
  },
  { title: "Scenarios", sections: [] },
];
