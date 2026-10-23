/**
 * The chat screen: the landing until the first send opens a session, then the session's transcript,
 * built from its view. Which one shows comes from the `ChatScreen` service, so other plugins'
 * commands can change it. `ctrl+c` quits when the composer's `ctrl+c` has no draft to clear;
 * `ctrl+b` opens and closes the sidebar drawer on a small screen, and its hint shows while the
 * drawer is closed.
 */

import type { BoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { Effect } from "effect";
import {
  type Accessor,
  createEffect,
  createSignal,
  For,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { Host } from "@shanepadgett/liminal-client";
import { LoopRpc, type SendMode } from "@shanepadgett/liminal-loop/contract";
import { MessageEvent, type SessionId, SessionRpc } from "@shanepadgett/liminal-session/contract";
import {
  type Command,
  keymapCommand,
  kit,
  SlotView,
  useRun,
  useSessionView,
} from "@shanepadgett/liminal-tui";

import { buildTranscript, isWriting, type Turn as TurnData } from "../view/index.ts";
import { Header } from "./Header.tsx";
import { Landing } from "./Landing.tsx";
import { Layout, useSidebarPlace } from "./Layout.tsx";
import type { ChatScreen as Screen } from "./screen.ts";
import {
  type ChatSend,
  type ChatSendRequest,
  composer,
  type ItemRenderer,
  sidebar,
} from "./slots.ts";
import { Prompt, type Renderers, Turn } from "./Turn.tsx";

/** The end of `ChatSend`: a new turn, or with `mode` a steer or follow-up of the running one. */
export const sendToLoop = Effect.map(Host, (host) =>
  Effect.fn("ChatSend.loop")(function* ({ session, input, mode }: ChatSendRequest) {
    const loop = yield* host.client(LoopRpc);

    yield* loop["loop/send"]({ session, input, mode });
  }, Effect.scoped),
);

const openSession = Effect.gen(function* () {
  const sessions = yield* (yield* Host).client(SessionRpc);

  return yield* sessions["session/open"]();
}).pipe(Effect.scoped);

const cancel = (session: SessionId) =>
  Effect.gen(function* () {
    const loop = yield* (yield* Host).client(LoopRpc);

    yield* loop["loop/cancel"]({ session });
  }).pipe(Effect.scoped);

/** The turns of the session on screen, keeping each turn's and item's identity across updates. */
const useTurns = (state: Parameters<typeof buildTranscript>[0], renderers: Accessor<Renderers>) => {
  const [turns, setTurns] = createStore<{ list: TurnData[] }>({ list: [] });

  createEffect(() => {
    const built = buildTranscript(state, new Set(renderers().keys()));

    setTurns("list", reconcile([...built], { key: "id" }));
  });

  return () => turns.list;
};

function SessionScreen(props: {
  readonly session: SessionId;
  readonly renderers: Accessor<Renderers>;
  readonly isSidebarOpen: boolean;
  readonly closeSidebar: () => void;
  readonly send: (text: string, mode?: SendMode) => void;
}) {
  const run = useRun();
  const view = useSessionView(props.session);
  const turns = useTurns(view.state, props.renderers);
  const lastIndex = () => turns().length - 1;

  return (
    <Layout
      header={<Header isWorking={view.state.running} />}
      pinned={<Show when={turns().at(-1)?.input}>{(input) => <Prompt input={input()} />}</Show>}
      transcript={
        <>
          <For each={turns()}>
            {(turn, index) => (
              <Turn
                turn={turn}
                showsInput={index() !== lastIndex()}
                renderers={props.renderers()}
              />
            )}
          </For>
          <Show when={view.state.running && !isWriting(view.state)}>
            <box paddingLeft={3}>
              <kit.Spinner />
            </box>
          </Show>
        </>
      }
      composer={
        <SlotView
          slot={composer}
          running={view.state.running}
          send={props.send}
          cancel={() => {
            run(cancel(props.session));
          }}
        />
      }
      sidebar={
        <box flexGrow={1} paddingX={2}>
          <SlotView slot={sidebar} session={props.session} state={view.state} />
        </box>
      }
      isSidebarOpen={props.isSidebarOpen}
      closeSidebar={props.closeSidebar}
    />
  );
}

function LandingScreen(props: { readonly send: (text: string, mode?: SendMode) => void }) {
  return (
    <Layout
      transcript={<Landing />}
      composer={<SlotView slot={composer} running={false} send={props.send} cancel={() => {}} />}
    />
  );
}

/** `ctrl+b` opens the drawer while it is closed and closes it while open. */
const sidebarCommands = (
  hasDrawer: Accessor<boolean>,
  isOpen: Accessor<boolean>,
  setOpen: (open: boolean) => void,
): Command[] => [
  {
    name: "chat.sidebar.show",
    title: "Show sidebar",
    hint: { label: "sidebar" },
    enabled: () => hasDrawer() && !isOpen(),
    run: () => {
      setOpen(true);
    },
  },
  {
    name: "chat.sidebar.hide",
    title: "Hide sidebar",
    enabled: () => hasDrawer() && isOpen(),
    run: () => {
      setOpen(false);
    },
  },
];

/** `ctrl+c` quits anywhere; the sidebar keys act while focus is on the screen. */
const useScreenKeys = (
  quit: () => void,
  root: () => BoxRenderable | undefined,
  drawerKeys: ReadonlyArray<Command>,
) => {
  useBindings(() => ({
    commands: [{ name: "chat.quit", title: "Quit", run: quit }],
    bindings: [{ key: "ctrl+c", cmd: "chat.quit" }],
  }));

  useBindings(() => ({
    target: root,
    commands: drawerKeys.map(keymapCommand),
    bindings: drawerKeys.map(({ name }) => ({ key: "ctrl+b", cmd: name })),
  }));
};

/**
 * The first send opens the session; quitting before it saves nothing. The session shows once the
 * send is through, so `ChatSend` wraps still see the screen it was sent from.
 */
const sendText = Effect.fn("ChatView.send")(function* (
  screen: Screen["Service"],
  chatSend: ChatSend["Service"],
  text: string,
  mode: SendMode | undefined,
) {
  const session = screen.session() ?? (yield* openSession);
  const input = yield* MessageEvent.make({ role: "user", parts: [{ type: "text", text }] });

  yield* chatSend.run({ session, input, mode }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        screen.show(session);
      }),
    ),
  );
});

export function ChatView(props: {
  readonly views: ItemRenderer["Service"];
  readonly screen: Screen["Service"];
  readonly chatSend: ChatSend["Service"];
  readonly quit: () => void;
}) {
  const run = useRun();
  const [renderers, setRenderers] = createSignal<Renderers>(new Map());
  const [isSidebarOpen, setSidebarOpen] = createSignal(false);
  const place = useSidebarPlace();
  const hasDrawer = () => props.screen.session() !== undefined && place().kind === "drawer";
  let root: BoxRenderable | undefined;

  useScreenKeys(props.quit, () => root, sidebarCommands(hasDrawer, isSidebarOpen, setSidebarOpen));

  onMount(() => {
    run(
      Effect.map(props.views.list, (views) => {
        setRenderers(new Map(views.map((view) => [view.kind, view.component])));
      }),
    );
  });

  const send = (text: string, mode?: SendMode) => {
    run(sendText(props.screen, props.chatSend, text, mode));
  };

  const session = props.screen.session;

  // One root element: the screen slot draws its fill again whenever the fill's root changes.
  return (
    <box
      ref={(made) => {
        root = made;
      }}
      width="100%"
      height="100%"
    >
      <Switch>
        <Match when={session()} keyed>
          {(open) => (
            <SessionScreen
              session={open}
              renderers={renderers}
              isSidebarOpen={isSidebarOpen()}
              closeSidebar={() => {
                setSidebarOpen(false);
              }}
              send={send}
            />
          )}
        </Match>
        <Match when={session() === undefined}>
          <LandingScreen send={send} />
        </Match>
      </Switch>
    </box>
  );
}
