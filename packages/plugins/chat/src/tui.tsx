/**
 * Chat's TUI part: starts on a new session, which the first prompt creates, follows it, and draws
 * the chat screen into the root slot, declaring the chat slots. The session is kept across reloads
 * and restarts. `/new` switches to a new session. It draws the user's and the model's words; every
 * other plugin registers views for its own entry and live kinds.
 */

import { Effect, Stream, SubscriptionRef } from "effect";

import { RootSlot, SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiCommands, TuiHost } from "@liminal/sdk/tui";
import { ReasoningEntry, TextEntry, UserEntry } from "@liminal/session-log/contract";

import { ChatSlots } from "./contract.ts";
import { ChatScreen } from "./tui/ChatScreen.tsx";
import { Prompt, Said, Thought } from "./tui/entries.tsx";
import { emptyTranscript, fold } from "./tui/transcript-state.ts";

/** A session id no session has yet. */
const newSession = () => SessionId.make(crypto.randomUUID());

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
      () => <ChatScreen sessionId={view().session} transcript={() => view().transcript} />,
      Object.values(ChatSlots),
    );

    yield* host.register(ChatSlots.entry, { key: UserEntry.kind, meta: {} }, Prompt);
    yield* host.register(ChatSlots.entry, { key: TextEntry.kind, meta: {} }, Said);
    yield* host.register(ChatSlots.entry, { key: ReasoningEntry.kind, meta: {} }, Thought);
  }),
});
