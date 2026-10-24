/**
 * The chat screen: the landing until the first send opens a session, then the session's transcript,
 * built from its view. Which one shows comes from the `ChatScreen` service, so other plugins'
 * commands can change it. `tab` puts focus on the draft while no dialog is open, `ctrl+q` quits,
 * and the composer shows both hints even while its draft lacks focus; `ctrl+b` opens and closes the
 * sidebar drawer on a small screen, and its hint shows while the drawer is closed.
 */

import type { BoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { Dynamic } from "@opentui/solid";
import { Effect, Option } from "effect";
import {
  type Accessor,
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  splitProps,
  Switch,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { Host } from "@shanepadgett/liminal-client";
import { LoopRpc, type SendMode } from "@shanepadgett/liminal-loop/contract";
import { MessageEvent, type SessionId, SessionRpc } from "@shanepadgett/liminal-session/contract";
import {
  type Command,
  type Dialogs,
  keymapCommand,
  kit,
  SlotView,
  useRun,
  useSessionView,
} from "@shanepadgett/liminal-tui";

import { buildTranscript, draftTextOf, isWriting, type Turn as TurnData } from "../view/index.ts";
import { Header } from "./Header.tsx";
import { Landing } from "./Landing.tsx";
import { Layout, useSidebarPlace } from "./Layout.tsx";
import type { Draft, ChatScreen as Screen } from "./screen.ts";
import {
  type ChatSend,
  type ChatSendRequest,
  composer,
  type ComposerCover,
  type ComposerCovers,
  type CoverProps,
  type ItemRenderer,
  type Mood,
  type MoodProps,
  type Moods,
  sidebar,
  type ToolRows,
  ToolRowView,
} from "./slots.ts";
import { type Renderers, Turn } from "./Turn.tsx";

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

/** Stops the turn, or only empties its queue; the queued inputs' text goes back into the draft. */
const takeBack = Effect.fn("ChatView.takeBack")(function* (
  session: SessionId,
  draft: Draft,
  how: "loop/cancel" | "loop/pull-back",
) {
  const loop = yield* (yield* Host).client(LoopRpc);
  const inputs = yield* loop[how]({ session });
  const texts = inputs.flatMap((input) => Option.toArray(draftTextOf(input)));
  if (texts.length === 0) return;

  yield* Effect.sync(() => {
    draft.prepend(texts.join("\n\n"));
  });
}, Effect.scoped);

/** The turns of the session on screen, keeping each turn's and item's identity across updates. */
const useTurns = (state: Parameters<typeof buildTranscript>[0], renderers: Accessor<Renderers>) => {
  const [turns, setTurns] = createStore<{ list: TurnData[] }>({ list: [] });

  createEffect(() => {
    const built = buildTranscript(
      state,
      new Set(renderers().events.keys()),
      renderers().hiddenTools,
    );

    setTurns("list", reconcile([...built], { key: "id" }));
  });

  return () => turns.list;
};

/** The composer, or the first cover active in its place. */
function ComposerPlace(props: CoverProps & { readonly covers: ReadonlyArray<ComposerCover> }) {
  const [local, coverProps] = splitProps(props, ["covers"]);
  const cover = () => local.covers.find((each) => each.active(coverProps));

  return (
    <Show
      when={cover()}
      fallback={
        <SlotView
          slot={composer}
          running={props.running}
          queued={props.queued}
          send={props.send}
          cancel={props.cancel}
          pullBack={props.pullBack}
        />
      }
    >
      {(active) => <Dynamic component={active().component} {...coverProps} />}
    </Show>
  );
}

/** The first active mood, which the header and Porter both follow; none leaves them their own. */
const moodOf = (moods: ReadonlyArray<Mood>, props: MoodProps) =>
  moods.find((each) => each.active(props));

/** Porter, in the mood's words and faces, else his own. */
function Working(props: MoodProps & { readonly mood: Mood | undefined }) {
  const [local, moodProps] = splitProps(props, ["mood"]);

  return (
    <box paddingLeft={3}>
      <kit.Porter words={local.mood?.words(moodProps)} poses={local.mood?.poses} />
    </box>
  );
}

/** Tells the screen whether a turn runs in the session showing; none runs once it goes. */
const useRunning = (screen: Screen["Service"], running: () => boolean) => {
  createEffect(() => {
    screen.setRunning(running());
  });

  onCleanup(() => {
    screen.setRunning(false);
  });
};

function SessionScreen(props: {
  readonly session: SessionId;
  readonly renderers: Accessor<Renderers>;
  readonly covers: Accessor<ReadonlyArray<ComposerCover>>;
  readonly moods: Accessor<ReadonlyArray<Mood>>;
  readonly isSidebarOpen: boolean;
  readonly closeSidebar: () => void;
  readonly screen: Screen["Service"];
  readonly send: (text: string, mode?: SendMode) => void;
}) {
  const run = useRun();
  const view = useSessionView(props.session);

  useRunning(props.screen, () => view.state.running);

  const turns = useTurns(view.state, props.renderers);
  const mood = () => moodOf(props.moods(), { session: props.session, state: view.state });

  return (
    <Layout
      header={
        <Header
          session={props.session}
          isScanning={view.state.running && mood()?.header !== "still"}
        />
      }
      transcript={
        <>
          <For each={turns()}>
            {(turn) => <Turn turn={turn} renderers={props.renderers()} state={view.state} />}
          </For>
          <Show when={view.state.running && !isWriting(view.state)}>
            <Working mood={mood()} session={props.session} state={view.state} />
          </Show>
        </>
      }
      composer={
        <ComposerPlace
          covers={props.covers()}
          session={{ id: props.session, state: view.state }}
          running={view.state.running}
          queued={view.state.queued}
          send={props.send}
          cancel={() => {
            run(takeBack(props.session, props.screen.draft, "loop/cancel"));
          }}
          pullBack={() => {
            run(takeBack(props.session, props.screen.draft, "loop/pull-back"));
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

function LandingScreen(props: {
  readonly covers: Accessor<ReadonlyArray<ComposerCover>>;
  readonly send: (text: string, mode?: SendMode) => void;
}) {
  return (
    <Layout
      transcript={<Landing />}
      composer={
        <ComposerPlace
          covers={props.covers()}
          session={undefined}
          running={false}
          queued={[]}
          send={props.send}
          cancel={() => {}}
          pullBack={() => {}}
        />
      }
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
    category: "Liminal",
    hint: { label: "sidebar" },
    enabled: () => hasDrawer() && !isOpen(),
    run: () => {
      setOpen(true);
    },
  },
  {
    name: "chat.sidebar.hide",
    title: "Hide sidebar",
    category: "Liminal",
    enabled: () => hasDrawer() && isOpen(),
    run: () => {
      setOpen(false);
    },
  },
];

/** `tab` puts focus on the draft while no dialog is open; `ctrl+q` quits, even under a dialog. */
const screenCommands = (
  screen: Screen["Service"],
  dialogs: Dialogs["Service"],
  quit: () => void,
): ReadonlyArray<Command> => [
  {
    name: "chat.focus-draft",
    title: "Focus the draft",
    category: "Liminal",
    hint: { label: "focus" },
    enabled: () => dialogs.top() === undefined && screen.canFocusDraft(),
    run: screen.focusDraft,
  },
  { name: "chat.quit", title: "Quit", category: "Liminal", hint: { label: "quit" }, run: quit },
];

const SCREEN_KEYS = [
  { key: "tab", cmd: "chat.focus-draft" },
  { key: "ctrl+q", cmd: "chat.quit" },
];

/** The screen's keys act anywhere; the sidebar keys act while focus is on the screen. */
const useScreenKeys = (
  screenKeys: ReadonlyArray<Command>,
  root: () => BoxRenderable | undefined,
  drawerKeys: ReadonlyArray<Command>,
) => {
  useBindings(() => ({ commands: screenKeys.map(keymapCommand), bindings: SCREEN_KEYS }));

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

/** What other plugins added to the transcript and the composer's place, read once it draws. */
const useAdded = (props: {
  readonly views: ItemRenderer["Service"];
  readonly toolRows: ToolRows["Service"];
  readonly covers: ComposerCovers["Service"];
  readonly moods: Moods["Service"];
}) => {
  const run = useRun();

  const [renderers, setRenderers] = createSignal<Renderers>({
    events: new Map(),
    tools: new Map(),
    hiddenTools: new Set(),
  });

  const [covers, setCovers] = createSignal<ReadonlyArray<ComposerCover>>([]);
  const [moods, setMoods] = createSignal<ReadonlyArray<Mood>>([]);

  onMount(() => {
    run(
      Effect.map(
        Effect.all([props.views.list, props.toolRows.list, props.covers.list, props.moods.list]),
        ([views, rows, added, moodsAdded]) => {
          setRenderers({
            events: new Map(views.map((view) => [view.kind, view.component])),
            tools: new Map(
              rows.flatMap((row) =>
                ToolRowView.$is("Shown")(row) ? [[row.tool, row.component] as const] : [],
              ),
            ),
            hiddenTools: new Set(
              rows.flatMap((row) => (ToolRowView.$is("Hidden")(row) ? [row.tool] : [])),
            ),
          });

          setCovers(added);
          setMoods(moodsAdded);
        },
      ),
    );
  });

  return { renderers, covers, moods };
};

export function ChatView(props: {
  readonly views: ItemRenderer["Service"];
  readonly toolRows: ToolRows["Service"];
  readonly covers: ComposerCovers["Service"];
  readonly moods: Moods["Service"];
  readonly screen: Screen["Service"];
  readonly chatSend: ChatSend["Service"];
  readonly dialogs: Dialogs["Service"];
  readonly quit: () => void;
}) {
  const run = useRun();
  const { renderers, covers, moods } = useAdded(props);
  const [isSidebarOpen, setSidebarOpen] = createSignal(false);
  const place = useSidebarPlace();
  const hasDrawer = () => props.screen.session() !== undefined && place().kind === "drawer";
  let root: BoxRenderable | undefined;

  useScreenKeys(
    screenCommands(props.screen, props.dialogs, props.quit),
    () => root,
    sidebarCommands(hasDrawer, isSidebarOpen, setSidebarOpen),
  );

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
              covers={covers}
              moods={moods}
              isSidebarOpen={isSidebarOpen()}
              closeSidebar={() => {
                setSidebarOpen(false);
              }}
              screen={props.screen}
              send={send}
            />
          )}
        </Match>
        <Match when={session() === undefined}>
          <LandingScreen covers={covers} send={send} />
        </Match>
      </Switch>
    </box>
  );
}
