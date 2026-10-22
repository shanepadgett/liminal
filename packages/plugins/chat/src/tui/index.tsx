/**
 * Chat's `tui` entry: it fills the screen with the chat screen, its sidebar with the Session
 * section and its composer slot with the composer, and provides `ItemRenderer` for other plugins'
 * event kinds.
 */
import { Effect, Layer } from "effect";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import { Renderer, screen, Slots } from "@shanepadgett/liminal-tui";

import { ChatScreen } from "./ChatScreen.tsx";
import { Composer } from "./Composer.tsx";
import { SessionSection } from "./Sidebar.tsx";
import { composer, ItemRenderer, type ItemView, sidebar } from "./slots.ts";

export {
  composer,
  type ComposerProps,
  ItemRenderer,
  type ItemView,
  sidebar,
  type SidebarProps,
} from "./slots.ts";

const fill = Effect.gen(function* () {
  const slots = yield* Slots;
  const renderer = yield* Renderer;
  const views = yield* ItemRenderer;

  const quit = () => {
    renderer.destroy();
  };

  yield* slots.fill(screen, () => <ChatScreen views={views} quit={quit} />);
  yield* slots.fill(sidebar, SessionSection);
  yield* slots.fill(composer, Composer);
});

export default definePlugin({
  name: "chat-tui",
  provides: [ItemRenderer],
  requires: [Slots, Renderer],
  layer: Layer.effectDiscard(fill).pipe(
    Layer.provideMerge(Layer.effect(ItemRenderer, Registry.make<ItemView>())),
  ),
});
