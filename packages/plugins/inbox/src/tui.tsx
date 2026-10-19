/**
 * Inbox's TUI part: the composer, which takes chat's composer slot at priority 0 and always
 * matches, and its key hints, which take the composer hints slot the same way.
 */

import { Effect, Option, Predicate, Record, Schema, Stream } from "effect";
import { createSignal } from "solid-js";

import { AgentLoopRpcs, type DefaultsView } from "@liminal/agent-loop/contract";
import { ChatSlots } from "@liminal/chat/contract";
import { SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiCommands, TuiDialogs, TuiHost } from "@liminal/sdk/tui";

import { InboxRpcs, InboxSlots, type Queued } from "./contract.ts";
import { type ComposerDeps, makeComposer, makeHints, type ModelLine } from "./tui/Composer.tsx";
import { makeEditor, stashes } from "./tui/stash.tsx";

/** Each session's draft, kept across restarts. */
const Drafts = Schema.Record(SessionId, Schema.String);

const noQueue: Queued = { steers: [], followUps: [] };
const loading: ModelLine = { set: false, reason: "" };

const modelLine = (view: DefaultsView): ModelLine =>
  Predicate.isTagged(view, "DefaultsSet")
    ? { set: true, model: view.settings.model.id, thinking: view.thinkingLabel ?? "" }
    : { set: false, reason: view.message };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const inbox = yield* host.client(InboxRpcs);
    const loop = yield* host.client(AgentLoopRpcs);
    const kept = host.keep("drafts", Drafts, (): typeof Drafts.Type => ({}));

    const drafts = host.sessionState("draft", (session) => {
      const [draft, setDraft] = createSignal(kept.get()[session] ?? "");

      const write = (text: string) => {
        setDraft(text);
        const others = Record.remove(kept.get(), session);
        kept.set(text === "" ? others : { ...others, [session]: text });
      };

      return [draft, write] as const;
    });

    const [problem, setProblem] = createSignal("");
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;

    const editor = makeEditor();
    const stash = yield* stashes(bridge, editor);
    const model = bridge.watch(loop["agent-loop/defaults"]().pipe(Stream.map(modelLine)), loading);

    const deps: ComposerDeps = {
      draft: (session) => drafts.of(session),
      send: (session, input, mode) => {
        bridge.run(
          inbox["inbox/send"]({ session, input, mode }).pipe(
            Effect.match({
              onFailure: (error) => setProblem(error.message),
              onSuccess: () => setProblem(""),
            }),
          ),
        );
      },
      findTags: (query, found) => {
        bridge.run(Effect.map(inbox["inbox/tags"]({ query }), found));
      },
      readPicture: (read, added) => {
        bridge.run(Effect.map(read, Option.map(added)));
      },
      stash,
      editor,
      queue: (session) => bridge.watch(inbox["inbox/queue"]({ session }), noQueue),
      model,
      problem,
      commands,
      dialogOpen: () => dialogs.top() !== undefined,
    };

    yield* host.register(
      ChatSlots.composer,
      { select: () => true, priority: 0 },
      makeComposer(deps),
      [InboxSlots.input],
    );

    yield* host.register(
      ChatSlots.composerHints,
      { select: () => true, priority: 0 },
      makeHints(deps),
    );
  }),
});
