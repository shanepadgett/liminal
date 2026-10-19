/**
 * Agent-loop's TUI part: `/model` lists every signed-in provider's models, then the picked model's
 * thinking options, and picks both for the next turn of the session on screen. A provider whose
 * list failed shows the failure. It draws the streaming reply and the retry line at the
 * transcript's end.
 */

import { Effect, Option, Predicate, Stream } from "effect";
import { createSignal, onCleanup } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import { ModelsRpcs } from "@liminal/models/contract";
import type { ModelRef, SessionId } from "@liminal/sdk";
import {
  type DialogProps,
  defineTui,
  makeBridge,
  SelectDialog,
  TuiCommands,
  TuiDialogs,
  type TuiDialogsService,
  TuiHost,
} from "@liminal/sdk/tui";

import {
  AgentLoopRpcs,
  DefaultsMissing,
  type DefaultsView,
  LiveReply,
  LiveRetry,
} from "./contract.ts";
import { Reply, Retry } from "./tui/live.tsx";
import {
  currentThinking,
  listAll,
  modelKey,
  modelOf,
  modelOptions,
  type PickedModel,
  type ProviderModels,
  thinkingOptions,
} from "./tui/models.ts";

/** Where the model line's items go. */
const LINE_ORDER = 70;

/** The session's model's key, if one is set. */
const currentKey = (view: DefaultsView) =>
  Predicate.isTagged(view, "DefaultsSet") ? modelKey(view.settings.model) : undefined;

/** The session's thinking option, if one is set. */
const savedThinking = (view: DefaultsView) =>
  Predicate.isTagged(view, "DefaultsSet") ? view.settings.thinking : undefined;

/** Picking a model runs `pickModel`; picking a failure row does nothing. */
const pickOf =
  (listed: ReadonlyArray<ProviderModels>, pickModel: (model: PickedModel) => void) =>
  (key: string) => {
    const model = modelOf(listed, key);
    if (model !== undefined) pickModel(model);
  };

/** The settings a stream shows first. */
const firstView = <E,>(views: Stream.Stream<DefaultsView, E>) =>
  views.pipe(
    Stream.runHead,
    Effect.map(Option.getOrElse(() => DefaultsMissing.make({ message: "" }))),
  );

/** Draws nothing; tells `set` which session is on screen. */
const onScreenOf = (set: (session?: SessionId) => void) =>
  function OnScreen(props: { readonly sessionId: SessionId }) {
    set(props.sessionId);

    onCleanup(() => {
      set();
    });

    return null;
  };

/** Picks the model, and the thinking option when given, for the session's next turn. */
type Pick = (model: ModelRef, thinking?: string) => void;

/** What the model dialogs show and do for the session on screen. */
interface Switching {
  readonly dialogs: TuiDialogsService;
  /** The session's settings when `/model` ran. */
  readonly view: DefaultsView;
  readonly pick: Pick;
}

/** Asks for a thinking option when the model offers any, then picks both. */
const pickThinking =
  ({ dialogs, view, pick }: Switching) =>
  ({ ref, info }: PickedModel) => {
    if (info.thinking.length === 0) {
      pick(ref);

      return;
    }

    dialogs.show((props: DialogProps) => (
      <SelectDialog
        title={`Thinking · ${info.name}`}
        options={thinkingOptions(info)}
        current={currentThinking(info, savedThinking(view))}
        close={props.close}
        onSelect={(thinking) => {
          pick(ref, thinking);
        }}
      />
    ));
  };

const showModels = (switching: Switching, listed: ReadonlyArray<ProviderModels>) => {
  switching.dialogs.show((props: DialogProps) => (
    <SelectDialog
      title="Models"
      options={modelOptions(listed)}
      current={currentKey(switching.view)}
      close={props.close}
      onSelect={pickOf(listed, pickThinking(switching))}
    />
  ));
};

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const loop = yield* host.client(AgentLoopRpcs);
    const models = yield* host.client(ModelsRpcs);

    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();

    const listing = listAll(models["models/providers"](), (provider) =>
      models["models/list"]({ provider: provider.id }),
    );

    const switchModel = (session: SessionId) => {
      const pick: Pick = (model, thinking) => {
        const payload = thinking === undefined ? { session, model } : { session, model, thinking };
        bridge.run(loop["agent-loop/pick"](payload));
      };

      bridge.run(
        Effect.map(
          Effect.all([listing, firstView(loop["agent-loop/session-defaults"]({ session }))]),
          ([listed, view]) => {
            showModels({ dialogs, view, pick }, listed);
          },
        ),
      );
    };

    yield* commands.register([
      {
        name: "model.switch",
        title: "Switch model",
        desc: "Switch the model",
        category: "Model",
        slash: { name: "model" },
        palette: true,
        run: () => {
          const session = onScreen();
          if (session !== undefined) switchModel(session);
        },
      },
    ]);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "agent-loop", order: LINE_ORDER },
      onScreenOf(setOnScreen),
    );

    yield* host.register(ChatSlots.live, { key: LiveReply.kind, meta: {} }, Reply);
    yield* host.register(ChatSlots.live, { key: LiveRetry.kind, meta: {} }, Retry);
  }),
});
