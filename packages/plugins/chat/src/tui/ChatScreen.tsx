/**
 * The chat screen: the landing until the first send opens a session, then the session's transcript,
 * built from its view. `ctrl+c` quits, after the composer declines it; `ctrl+b` opens the sidebar
 * drawer on a small screen, and the composer's hints name it while the drawer is closed.
 */

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
import { kit, SlotView, useRun, useSessionView } from "@shanepadgett/liminal-tui";

import { buildTranscript, isWriting, type Turn as TurnData } from "../view/index.ts";
import { Header } from "./Header.tsx";
import { Landing } from "./Landing.tsx";
import { Layout, useSidebarPlace } from "./Layout.tsx";
import { composer, type ItemRenderer, sidebar } from "./slots.ts";
import { Prompt, type Renderers, Turn } from "./Turn.tsx";

type ScreenState =
  | { readonly kind: "landing" }
  | { readonly kind: "session"; readonly session: SessionId };

/** Sends `text` to `session`: a new turn, or with `mode` a steer or follow-up of the running one. */
const sendTo = (session: SessionId, text: string, mode: SendMode | undefined) =>
  Effect.gen(function* () {
    const loop = yield* (yield* Host).client(LoopRpc);
    const input = yield* MessageEvent.make({ role: "user", parts: [{ type: "text", text }] });

    yield* loop["loop/send"]({ session, input, mode });
  }).pipe(Effect.scoped);

const openSession = Effect.gen(function* () {
  const sessions = yield* (yield* Host).client(SessionRpc);

  return yield* sessions["session/open"]();
}).pipe(Effect.scoped);

const cancel = (session: SessionId) =>
  Effect.gen(function* () {
    const loop = yield* (yield* Host).client(LoopRpc);

    yield* loop["loop/cancel"]({ session });
  }).pipe(Effect.scoped);

const SIDEBAR_HINTS = [{ keys: "ctrl+b", label: "sidebar" }];

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
  const place = useSidebarPlace();

  const screenHints = () =>
    place().kind === "drawer" && !props.isSidebarOpen ? SIDEBAR_HINTS : [];

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
          screenHints={screenHints()}
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
      composer={
        <SlotView
          slot={composer}
          running={false}
          send={props.send}
          cancel={() => {}}
          screenHints={[]}
        />
      }
    />
  );
}

const useScreenKeys = (quit: () => void, toggleSidebar: () => void) => {
  useBindings(() => ({
    commands: [
      { name: "chat.quit", title: "Quit", run: quit },
      { name: "chat.sidebar", title: "Toggle sidebar", run: toggleSidebar },
    ],
    bindings: [
      { key: "ctrl+c", cmd: "chat.quit" },
      { key: "ctrl+b", cmd: "chat.sidebar" },
    ],
  }));
};

export function ChatScreen(props: {
  readonly views: ItemRenderer["Service"];
  readonly quit: () => void;
}) {
  const run = useRun();
  const [screenState, setScreenState] = createSignal<ScreenState>({ kind: "landing" });
  const [renderers, setRenderers] = createSignal<Renderers>(new Map());
  const [isSidebarOpen, setSidebarOpen] = createSignal(false);

  useScreenKeys(props.quit, () => {
    setSidebarOpen((open) => !open);
  });

  onMount(() => {
    run(
      Effect.map(props.views.list, (views) => {
        setRenderers(new Map(views.map((view) => [view.kind, view.component])));
      }),
    );
  });

  // The first send opens the session; quitting before it saves nothing.
  const send = (text: string, mode?: SendMode) => {
    run(
      Effect.gen(function* () {
        const current = screenState();
        const session = current.kind === "session" ? current.session : yield* openSession;
        setScreenState({ kind: "session", session });
        yield* sendTo(session, text, mode);
      }),
    );
  };

  const session = () => {
    const current = screenState();

    return current.kind === "session" ? current.session : undefined;
  };

  // One root element: the screen slot draws its fill again whenever the fill's root changes.
  return (
    <box width="100%" height="100%">
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
