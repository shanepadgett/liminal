/**
 * Agent-loop's TUI part: `/model` lists every signed-in provider's models, then the picked model's
 * thinking options, and picks both for the next turn of the session on screen. A provider whose
 * list failed shows the failure. `ctrl+t` moves the session's thinking option to the next one its
 * model offers. It draws the streaming reply and the retry line at the transcript's end.
 */

import { Effect, Option, Predicate, Stream } from "effect";
import { type Accessor, createSignal, onCleanup } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import { ModelsRpcs } from "@liminal/models/contract";
import type { ModelRef, SessionId } from "@liminal/sdk";
import {
  type Command,
  type DialogProps,
  defineTui,
  makeBridge,
  SelectDialog,
  TuiCommands,
  TuiDialogs,
  type TuiDialogsService,
  TuiHost,
  TuiToasts,
  type TuiToastsService,
} from "@liminal/sdk/tui";

import {
  AgentLoopRpcs,
  type CycleResult,
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

/** What the toast says when the model has no thinking option to move to. */
const NO_OPTIONS = "This model has no thinking options to cycle";

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

/** Tells the user a cycle found no thinking option to move to. */
const toastNoOptions = (toasts: TuiToastsService) => (result: CycleResult) =>
  Effect.sync(() => {
    if (Predicate.isTagged(result, "NoOptions"))
      toasts.show({ kind: "info", title: "Thinking", message: NO_OPTIONS });
  });

/** Tells the user why a cycle failed. */
const toastFailure = (toasts: TuiToastsService) => (error: { readonly message: string }) =>
  Effect.sync(() => {
    toasts.show({ kind: "error", title: "Thinking", message: error.message });
  });

/** What the model commands do for the session on screen. */
interface ModelActions {
  readonly switchModel: (session: SessionId) => void;
  readonly cycleThinking: (session: SessionId) => void;
}

/** `/model` and the thinking cycle, each acting on the session on screen when there is one. */
const modelCommands = (
  onScreen: Accessor<SessionId | undefined>,
  actions: ModelActions,
): ReadonlyArray<Command> => [
  {
    name: "model.switch",
    title: "Switch model",
    desc: "Switch the model",
    category: "Model",
    slash: { name: "model" },
    palette: true,
    run: () => {
      const session = onScreen();
      if (session !== undefined) actions.switchModel(session);
    },
  },
  {
    name: "thinking.cycle",
    title: "Cycle thinking",
    desc: "Use the next thinking option of the model",
    category: "Model",
    palette: true,
    run: () => {
      const session = onScreen();
      if (session !== undefined) actions.cycleThinking(session);
    },
  },
];

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const toasts = yield* TuiToasts;
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

    const cycleThinking = (session: SessionId) => {
      bridge.run(
        loop["agent-loop/cycle-thinking"]({ session }).pipe(
          Effect.tap(toastNoOptions(toasts)),
          Effect.tapError(toastFailure(toasts)),
        ),
      );
    };

    yield* commands.register(modelCommands(onScreen, { switchModel, cycleThinking }), [
      { key: "ctrl+t", cmd: "thinking.cycle" },
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
