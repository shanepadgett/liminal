/**
 * Chat's TUI part: starts on a new session, which the first prompt creates, follows it, and draws
 * the chat screen into the root slot, declaring the chat slots. The session is kept across reloads
 * and restarts. `/new` switches to a new session; `/sessions` to one of this folder's sessions. It
 * draws the user's and the model's words; every other plugin registers views for its own entry and
 * live kinds. `/debug` flips the debug view for the run, with a toast saying which; the `debug`
 * setting sets where it starts.
 */

import { Effect, Schema, Stream, SubscriptionRef } from "effect";
import { createSignal } from "solid-js";

import { RootSlot, SessionId } from "@liminal/sdk";
import {
  defineTui,
  makeBridge,
  type ToastMessage,
  TuiCommands,
  TuiHost,
  TuiToasts,
} from "@liminal/sdk/tui";
import { ReasoningEntry, TextEntry, UserEntry } from "@liminal/session-log/contract";

import { ChatRpcs, ChatSlots } from "./contract.ts";
import { ChatScreen } from "./tui/ChatScreen.tsx";
import { Prompt, Said, Thought } from "./tui/entries.tsx";
import { sessionsCommand } from "./tui/sessions.tsx";
import { emptyTranscript, fold } from "./tui/transcript-state.ts";

/** A session id no session has yet. */
const newSession = () => SessionId.make(crypto.randomUUID());

/** The run's debug view: as the setting says until `/debug` turns it on or off. */
const DebugChoice = Schema.Literals(["setting", "on", "off"]);

type DebugChoice = typeof DebugChoice.Type;

const DEBUG_ON: ToastMessage = {
  kind: "info",
  title: "Debug view on",
  message: "Debug entries show in the transcript.",
};

const DEBUG_OFF: ToastMessage = { kind: "info", title: "Debug view off" };

/** Whether debug entries draw, and `/debug`, which flips it for the run. */
const debugView = Effect.gen(function* () {
  const host = yield* TuiHost;
  const bridge = yield* makeBridge;
  const client = yield* host.client(ChatRpcs);
  const setting = bridge.watch(Stream.fromEffect(client["chat/debug"]()), false);
  // Kept, so the run's choice holds across reloads and restarts until the app quits.
  const toasts = yield* TuiToasts;
  const kept = host.keep("debug", DebugChoice, (): DebugChoice => "setting");
  const [choice, setChoice] = createSignal(kept.get());
  const debug = () => (choice() === "setting" ? setting() : choice() === "on");

  yield* (yield* TuiCommands).register([
    {
      name: "view.debug",
      title: "Debug view",
      desc: "Show or hide debug entries in the transcript",
      category: "View",
      slash: { name: "debug" },
      palette: true,
      run: () => {
        const next = debug() ? "off" : "on";
        kept.set(next);
        setChoice(next);
        toasts.show(next === "on" ? DEBUG_ON : DEBUG_OFF);
      },
    },
  ]);

  return debug;
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const kept = host.keep("session", SessionId, newSession);
    const first = kept.get();
    const current = yield* SubscriptionRef.make(first);

    yield* SubscriptionRef.changes(current).pipe(
      Stream.runForEach((session) =>
        Effect.sync(() => {
          kept.set(session);
        }),
      ),
      Effect.forkScoped,
    );

    const view = bridge.watch(
      SubscriptionRef.changes(current).pipe(
        Stream.switchMap((session) =>
          Stream.scan(host.follow(session), () => emptyTranscript, fold).pipe(
            Stream.map((transcript) => ({ session, transcript })),
          ),
        ),
      ),
      { session: first, transcript: emptyTranscript },
    );

    const debug = yield* debugView;
    const toasts = yield* TuiToasts;

    yield* sessionsCommand(current);

    yield* commands.register([
      {
        name: "session.new",
        title: "New session",
        desc: "Start a fresh session",
        category: "Session",
        slash: { name: "new" },
        palette: true,
        run: () => {
          bridge.run(SubscriptionRef.set(current, newSession()));
        },
      },
    ]);

    yield* host.register(
      RootSlot,
      {},
      () => (
        <ChatScreen
          sessionId={view().session}
          transcript={() => view().transcript}
          debug={debug}
          toasts={toasts}
        />
      ),
      Object.values(ChatSlots),
    );

    yield* host.register(ChatSlots.entry, { key: UserEntry.kind, meta: {} }, Prompt);
    yield* host.register(ChatSlots.entry, { key: TextEntry.kind, meta: {} }, Said);
    yield* host.register(ChatSlots.entry, { key: ReasoningEntry.kind, meta: {} }, Thought);
  }),
});
