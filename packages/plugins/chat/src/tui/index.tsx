/**
 * Chat's `tui` entry: it fills the screen with the chat screen, its sidebar with the Session
 * section and its composer slot with the composer. It provides `ItemRenderer` for other plugins'
 * event kinds, `ToolRows` for tools' own rows, `ComposerCovers` for what takes the composer's
 * place, `Moods` for what Porter murmurs, `ChatScreen` for what shows and the draft,
 * `DraftTriggers` for menus the draft opens, and `ChatSend` for every send. Notifications show
 * above the composer. `ctrl+n` and `/new` go back to the landing screen.
 */
import { Effect, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import { Dialogs, Keymap, Notifications, Renderer, screen, Slots } from "@shanepadgett/liminal-tui";

import { ChatView, sendToLoop } from "./ChatView.tsx";
import { Composer } from "./Composer.tsx";
import { ChatScreen, makeChatScreen } from "./screen.ts";
import { SessionSection } from "./Sidebar.tsx";
import {
  ChatSend,
  composer,
  type ComposerCover,
  ComposerCovers,
  ItemRenderer,
  type ItemView,
  type Mood,
  Moods,
  sidebar,
  ToolRows,
  type ToolRowView,
} from "./slots.ts";
import { type DraftTrigger, DraftTriggers } from "./triggers.ts";

export { Gutter } from "./Composer.tsx";
export { ChatScreen, type Draft, turnBlocked } from "./screen.ts";
export { WorkRow } from "./WorkRow.tsx";

export {
  ChatSend,
  type ChatSendRequest,
  composer,
  type ComposerCover,
  ComposerCovers,
  type ComposerProps,
  type CoverProps,
  ItemRenderer,
  type ItemView,
  type Mood,
  type MoodProps,
  Moods,
  sidebar,
  type SidebarProps,
  status,
  type StatusProps,
  title,
  type TitleProps,
  type ToolRowProps,
  ToolRows,
  ToolRowView,
} from "./slots.ts";

export {
  type DraftKey,
  type DraftRow,
  type DraftToken,
  type DraftTrigger,
  DraftTriggers,
  type OpenTrigger,
  replaceToken,
} from "./triggers.ts";

const fill = Effect.gen(function* () {
  const slots = yield* Slots;
  const renderer = yield* Renderer;
  const views = yield* ItemRenderer;
  const toolRows = yield* ToolRows;
  const covers = yield* ComposerCovers;
  const moods = yield* Moods;
  const chat = yield* ChatScreen;
  const triggers = yield* DraftTriggers;
  const chatSend = yield* ChatSend;
  const dialogs = yield* Dialogs;
  const notifications = yield* Notifications;

  const quit = () => {
    renderer.destroy();
  };

  yield* chat.registerDraftCommands(
    [
      {
        name: "chat.new",
        title: "New session",
        category: "Session",
        slash: { name: "new" },
        run: chat.startNew,
      },
    ],
    [{ key: "ctrl+n", cmd: "chat.new" }],
  );

  yield* slots.fill(screen, () => (
    <ChatView
      views={views}
      toolRows={toolRows}
      covers={covers}
      moods={moods}
      screen={chat}
      chatSend={chatSend}
      dialogs={dialogs}
      quit={quit}
    />
  ));

  yield* slots.fill(sidebar, SessionSection);

  yield* slots.fill(composer, (props) => (
    <Composer {...props} screen={chat} triggers={triggers} notifications={notifications} />
  ));
});

export default definePlugin({
  name: "chat-tui",
  provides: [ItemRenderer, ToolRows, ComposerCovers, Moods, ChatScreen, DraftTriggers, ChatSend],
  requires: [Host, Slots, Renderer, Keymap, Dialogs, Notifications],
  layer: Layer.effectDiscard(fill).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.effect(ItemRenderer, Registry.make<ItemView>()),
        Layer.effect(ToolRows, Registry.make<ToolRowView>()),
        Layer.effect(ComposerCovers, Registry.make<ComposerCover>()),
        Layer.effect(Moods, Registry.make<Mood>()),
        Layer.effect(ChatScreen, makeChatScreen),
        Layer.effect(DraftTriggers, Registry.make<DraftTrigger>()),
        Layer.effect(ChatSend, Effect.flatMap(sendToLoop, Pipeline.make)),
      ),
    ),
  ),
});
