/**
 * What the model line shows, kept in Solid signals: the pick waiting on a screen until its next
 * send, the model the screen's session runs, the models to pick from and the saved default.
 */
import { Data, Effect } from "effect";
import { createSignal } from "solid-js";

import type { ChatScreen } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import {
  defaultThinking,
  type ModelChoice,
  type ModelId,
  type ModelListing,
  ModelRpc,
} from "@shanepadgett/liminal-model/contract";
import type { SessionId } from "@shanepadgett/liminal-session/contract";

import { ModelChoiceRpc, sameChoice } from "../contract.ts";

/** A value that belongs to one screen: a session, or the landing while `screen` is undefined. */
interface OnScreen<A> {
  readonly screen: SessionId | undefined;
  readonly value: A;
}

/** What a screen's session runs: a model, none while no provider is connected, or not known. */
type Runs = Data.TaggedEnum<{
  Model: { readonly choice: ModelChoice };
  Unconnected: {};
  Unknown: {};
}>;

const Runs = Data.taggedEnum<Runs>();

/** `model` at `thinking`, leaving thinking unset when it is undefined. */
export const choiceOf = (model: ModelId, thinking: string | undefined): ModelChoice =>
  thinking === undefined ? { model } : { model, thinking };

/** `choice` at the level it runs at: its own, else its model's default among `listings`. */
const asRun = (listings: ReadonlyArray<ModelListing>, choice: ModelChoice) => {
  if (choice.thinking !== undefined) return choice;

  const levels = listings.find((listing) => listing.id === choice.model)?.thinking ?? [];

  return choiceOf(choice.model, defaultThinking(levels));
};

/** The model `held` runs, at the level it runs at; undefined when it runs none. */
const modelIn = (listings: ReadonlyArray<ModelListing>, held: Runs | undefined) =>
  held !== undefined && Runs.$is("Model")(held) ? asRun(listings, held.choice) : undefined;

const choices = Effect.flatMap(Host, (host) => host.client(ModelChoiceRpc));

const models = Effect.flatMap(Host, (host) => host.client(ModelRpc));

/** What `screen`'s session runs; `ModelNotFound` there means no provider is connected. */
const readRuns = (screen: SessionId | undefined) =>
  Effect.flatMap(choices, (client) => client["model-choice/session"]({ session: screen })).pipe(
    Effect.scoped,
    Effect.map((choice) => Runs.Model({ choice })),
    Effect.catchTag("ModelNotFound", () => Effect.succeed(Runs.Unconnected())),
    Effect.orElseSucceed(() => Runs.Unknown()),
  );

export const makeState = (chat: ChatScreen["Service"]) => {
  const [waiting, setWaiting] = createSignal<OnScreen<ModelChoice>>();
  const [shown, setShown] = createSignal<OnScreen<Runs>>();
  const [listings, setListings] = createSignal<ReadonlyArray<ModelListing>>([]);
  const [saved, setSaved] = createSignal<ModelChoice>();

  const here = <A>(held: OnScreen<A> | undefined) =>
    held !== undefined && held.screen === chat.session() ? held.value : undefined;

  const waitingHere = () => here(waiting());

  const listingOf = (model: ModelId) => listings().find((listing) => listing.id === model);

  /** The model the screen's session runs, or a new session would. */
  const runs = () => modelIn(listings(), here(shown()));

  /** The waiting pick, else the model that runs. */
  const line = (): ModelChoice | undefined => {
    const pick = waitingHere();

    return pick === undefined ? runs() : asRun(listings(), pick);
  };

  /** Whether no model runs because no provider is connected. */
  const unconnected = () => {
    const held = here(shown());

    return held !== undefined && Runs.$is("Unconnected")(held);
  };

  /** Waits on this screen until its next send; picking what already runs clears it. */
  const pick = (choice: ModelChoice) => {
    const now = runs();
    const isSame = now !== undefined && sameChoice(now, choice);

    setWaiting(isSame ? undefined : { screen: chat.session(), value: choice });
  };

  const sent = (screen: SessionId | undefined) => {
    if (waiting()?.screen === screen) setWaiting(undefined);
  };

  const reloadShown = (screen: SessionId | undefined) =>
    Effect.map(readRuns(screen), (value) => setShown({ screen, value }));

  const reloadList = Effect.flatMap(models, (client) => client["model/list"]()).pipe(
    Effect.scoped,
    Effect.map((next) => setListings(next)),
  );

  const reloadDefault = Effect.flatMap(choices, (client) => client["model-choice/default"]()).pipe(
    Effect.scoped,
    Effect.map((next) => setSaved(next)),
  );

  const saveDefault = (choice: ModelChoice) =>
    Effect.flatMap(choices, (client) => client["model-choice/set-default"]({ choice })).pipe(
      Effect.scoped,
      Effect.andThen(reloadDefault),
    );

  return {
    waiting: waitingHere,
    line,
    unconnected,
    listings,
    listingOf,
    saved,
    pick,
    sent,
    reloadShown,
    reloadList,
    reloadDefault,
    saveDefault,
  };
};

export type ModelState = ReturnType<typeof makeState>;
