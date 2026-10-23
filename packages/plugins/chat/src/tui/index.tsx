/**
 * Chat's `tui` entry: it fills the screen with the chat screen, its sidebar with the Session
 * section and its composer slot with the composer. It provides `ItemRenderer` for other plugins'
 * event kinds, `ChatScreen` for what shows and the draft, `DraftTriggers` for menus the draft
 * opens, and `ChatSend` for every send. `ctrl+n` and `/new` go back to the landing screen.
 */
import { Effect, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import { Keymap, Renderer, screen, Slots } from "@shanepadgett/liminal-tui";

import { ChatView, sendToLoop } from "./ChatView.tsx";
import { Composer } from "./Composer.tsx";
import { ChatScreen, makeChatScreen } from "./screen.ts";
import { SessionSection } from "./Sidebar.tsx";
import { ChatSend, composer, ItemRenderer, type ItemView, sidebar } from "./slots.ts";
import { type DraftTrigger, DraftTriggers } from "./triggers.ts";

export { ChatScreen, type Draft } from "./screen.ts";

export {
  ChatSend,
  type ChatSendRequest,
  composer,
  type ComposerProps,
  ItemRenderer,
  type ItemView,
  sidebar,
  type SidebarProps,
  status,
  type StatusProps,
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
  const chat = yield* ChatScreen;
  const triggers = yield* DraftTriggers;
  const chatSend = yield* ChatSend;

  const quit = () => {
    renderer.destroy();
  };

  yield* chat.registerDraftCommands(
    [{ name: "chat.new", title: "New session", slash: { name: "new" }, run: chat.startNew }],
    [{ key: "ctrl+n", cmd: "chat.new" }],
  );

  yield* slots.fill(screen, () => (
    <ChatView views={views} screen={chat} chatSend={chatSend} quit={quit} />
  ));

  yield* slots.fill(sidebar, SessionSection);
  yield* slots.fill(composer, (props) => <Composer {...props} screen={chat} triggers={triggers} />);
});

export default definePlugin({
  name: "chat-tui",
  provides: [ItemRenderer, ChatScreen, DraftTriggers, ChatSend],
  requires: [Host, Slots, Renderer, Keymap],
  layer: Layer.effectDiscard(fill).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.effect(ItemRenderer, Registry.make<ItemView>()),
        Layer.effect(ChatScreen, makeChatScreen),
        Layer.effect(DraftTriggers, Registry.make<DraftTrigger>()),
        Layer.effect(ChatSend, Effect.flatMap(sendToLoop, Pipeline.make)),
      ),
    ),
  ),
});
