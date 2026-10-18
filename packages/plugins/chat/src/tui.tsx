/**
 * Chat's TUI part: opens the most recent session, or a new one when there is none, follows it, and
 * draws the chat screen into the root slot, declaring the chat slots. It draws the entries and live
 * states of the plugins it builds on; other plugins register theirs.
 */

import { Effect, Stream } from "effect";
import type { RpcClient, RpcClientError, RpcGroup } from "effect/rpc";

import { LiveReply, LiveRetry } from "@liminal/agent-loop/contract";
import { RootSlot, SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiHost } from "@liminal/sdk/tui";
import {
  ReasoningEntry,
  SessionLogRpcs,
  TextEntry,
  UserEntry,
} from "@liminal/session-log/contract";

import { ChatSlots } from "./contract.ts";
import { ChatScreen } from "./tui/ChatScreen.tsx";
import { Prompt, Said, Thought } from "./tui/entries.tsx";
import { Reply, Retry } from "./tui/live.tsx";
import { emptyTranscript, fold } from "./tui/transcript-state.ts";

type Sessions = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof SessionLogRpcs>,
  RpcClientError.RpcClientError
>;

const openSession = Effect.fn("openSession")(function* (sessions: Sessions) {
  const [recent] = yield* sessions["session-log/list"]();
  if (recent !== undefined) return recent.id;

  const session = SessionId.make(crypto.randomUUID());
  yield* sessions["session-log/create"]({ session });

  return session;
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const session = yield* openSession(yield* host.client(SessionLogRpcs));

    const transcript = bridge.watch(
      Stream.scan(host.follow(session), () => emptyTranscript, fold),
      emptyTranscript,
    );

    yield* host.register(
      RootSlot,
      {},
      () => <ChatScreen sessionId={session} transcript={transcript} />,
      Object.values(ChatSlots),
    );

    yield* host.register(ChatSlots.entry, { key: UserEntry.kind, meta: {} }, Prompt);
    yield* host.register(ChatSlots.entry, { key: TextEntry.kind, meta: {} }, Said);
    yield* host.register(ChatSlots.entry, { key: ReasoningEntry.kind, meta: {} }, Thought);
    yield* host.register(ChatSlots.live, { key: LiveReply.kind, meta: {} }, Reply);
    yield* host.register(ChatSlots.live, { key: LiveRetry.kind, meta: {} }, Retry);
  }),
});
