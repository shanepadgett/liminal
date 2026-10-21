/**
 * Agent-loop's TUI part: `/model` lists every signed-in provider's models, then the picked model's
 * thinking options, and picks both for the next turn of the session on screen. A provider whose
 * list failed shows the failure. `ctrl+f` in the dialog moves a model to the favorites at the top;
 * `ctrl+d` sets the default model for new sessions. `ctrl+t` moves the session's thinking option to
 * the next one its model offers. It draws the streaming reply and the retry line at the
 * transcript's end.
 */

import { Effect, Option, Predicate, Stream } from "effect";
import { type Accessor, createSignal, onCleanup } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import { ModelsRpcs } from "@liminal/models/contract";
import type { ModelRef, SessionId } from "@liminal/sdk";
import {
  type Bridge,
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
  /** The key of the model set as the default, if one is. */
  readonly defaultKey: string | undefined;
  /** Saves the model, and the thinking option when given, as the default for new sessions. */
  readonly setDefault: Pick;
  /** Saves in the background that the model is a favorite, or no longer one. */
  readonly toggleFavorite: (model: ModelRef) => void;
}

/** Asks for a thinking option when the model offers any, then runs `apply` on both. */
const pickThinking =
  ({ dialogs, view }: Switching, apply: Pick, heading: string) =>
  ({ ref, info }: PickedModel) => {
    if (info.thinking.length === 0) {
      apply(ref);

      return;
    }

    dialogs.show((props: DialogProps) => (
      <SelectDialog
        title={`${heading} · ${info.name}`}
        options={thinkingOptions(info)}
        current={currentThinking(info, savedThinking(view))}
        close={props.close}
        onSelect={(thinking) => {
          apply(ref, thinking);
        }}
      />
    ));
  };

/** `keys` without `key` when it is in the set, else with it. */
const toggledKeys = (keys: ReadonlySet<string>, key: string) =>
  new Set(keys.has(key) ? [...keys].filter((each) => each !== key) : [...keys, key]);

/**
 * Opens the model dialog with the `saved` favorites first. `ctrl+f` moves the highlighted model in
 * or out of them at once, even if saving the change fails. `ctrl+d` asks for the model's thinking
 * option, then sets both as the default for new sessions.
 */
const showModels = (
  switching: Switching,
  listed: ReadonlyArray<ProviderModels>,
  saved: ReadonlyArray<ModelRef>,
) => {
  const [favorites, setFavorites] = createSignal<ReadonlySet<string>>(new Set(saved.map(modelKey)));

  const favorite = (key: string) => {
    const model = modelOf(listed, key);
    if (model === undefined) return;

    setFavorites(toggledKeys(favorites(), key));
    switching.toggleFavorite(model.ref);
  };

  switching.dialogs.show((props: DialogProps) => (
    <SelectDialog
      title="Models"
      options={modelOptions(listed, { favorites: favorites(), defaultKey: switching.defaultKey })}
      current={currentKey(switching.view)}
      close={props.close}
      onSelect={pickOf(listed, pickThinking(switching, switching.pick, "Thinking"))}
      actions={[
        { key: "ctrl+f", label: "favorite", keepsOpen: true, run: favorite },
        {
          key: "ctrl+d",
          label: "default",
          run: pickOf(listed, pickThinking(switching, switching.setDefault, "Default thinking")),
        },
      ]}
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

/** Tells the user a change to the favorites was not saved. */
const toastFavoriteFailure = (toasts: TuiToastsService) => (error: { readonly message: string }) =>
  Effect.sync(() => {
    toasts.show({ kind: "error", title: "Favorites", message: error.message });
  });

/** Tells the user the default was set, or why it was not. */
const toastDefault = (toasts: TuiToastsService, model: ModelRef) => ({
  saved: Effect.sync(() => {
    toasts.show({
      kind: "info",
      title: "Default model",
      message: `${modelKey(model)} is the default.`,
    });
  }),
  failed: (error: { readonly message: string }) =>
    Effect.sync(() => {
      toasts.show({ kind: "error", title: "Default model", message: error.message });
    }),
});

/** Picks for `session` in the background. */
const sessionPicker =
  (
    bridge: Bridge,
    session: SessionId,
    save: (payload: {
      session: SessionId;
      model: ModelRef;
      thinking?: string;
    }) => Effect.Effect<void, { readonly message: string }>,
  ): Pick =>
  (model, thinking) => {
    bridge.run(save(thinking === undefined ? { session, model } : { session, model, thinking }));
  };

/** Sets the default in the background and tells the user the outcome. */
const defaultSetter =
  (
    bridge: Bridge,
    toasts: TuiToastsService,
    save: (payload: {
      model: ModelRef;
      thinking?: string;
    }) => Effect.Effect<void, { readonly message: string }>,
  ): Pick =>
  (model, thinking) => {
    const told = toastDefault(toasts, model);

    bridge.run(
      save(thinking === undefined ? { model } : { model, thinking }).pipe(
        Effect.flatMap(() => told.saved),
        Effect.catch(told.failed),
      ),
    );
  };

/** Saves a favorite change in the background and tells the user when saving fails. */
const favoriteToggler =
  (
    bridge: Bridge,
    toasts: TuiToastsService,
    save: (model: ModelRef) => Effect.Effect<unknown, { readonly message: string }>,
  ) =>
  (model: ModelRef) => {
    bridge.run(save(model).pipe(Effect.tapError(toastFavoriteFailure(toasts)), Effect.ignore));
  };

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
      const pick = sessionPicker(bridge, session, (payload) => loop["agent-loop/pick"](payload));

      const setDefault = defaultSetter(bridge, toasts, (payload) =>
        loop["agent-loop/set-default"](payload),
      );

      const toggleFavorite = favoriteToggler(bridge, toasts, (model) =>
        loop["agent-loop/toggle-favorite"]({ model }),
      );

      bridge.run(
        Effect.map(
          Effect.all([
            listing,
            firstView(loop["agent-loop/session-defaults"]({ session })),
            loop["agent-loop/favorites"](),
            loop["agent-loop/default"](),
          ]),
          ([listed, view, saved, savedDefault]) => {
            const defaultKey = currentKey(savedDefault);

            showModels(
              { dialogs, view, pick, defaultKey, setDefault, toggleFavorite },
              listed,
              saved,
            );
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
