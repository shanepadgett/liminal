/**
 * What the model line shows, kept in Solid signals: the pick waiting on a screen until its next
 * send, the model the screen's session runs, the models to pick from and the saved default.
 */
import { Effect, Option } from "effect";
import { createSignal } from "solid-js";

import type { ChatScreen } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import {
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

/** `model` at `thinking`, leaving thinking unset when it is undefined. */
export const choiceOf = (model: ModelId, thinking: string | undefined): ModelChoice =>
  thinking === undefined ? { model } : { model, thinking };

const choices = Effect.flatMap(Host, (host) => host.client(ModelChoiceRpc));

const models = Effect.flatMap(Host, (host) => host.client(ModelRpc));

export const makeState = (chat: ChatScreen["Service"]) => {
  const [waiting, setWaiting] = createSignal<OnScreen<ModelChoice>>();
  const [shown, setShown] = createSignal<OnScreen<ModelChoice | undefined>>();
  const [listings, setListings] = createSignal<ReadonlyArray<ModelListing>>([]);
  const [saved, setSaved] = createSignal<ModelChoice>();

  const here = <A>(held: OnScreen<A> | undefined) =>
    held !== undefined && held.screen === chat.session() ? held.value : undefined;

  const waitingHere = () => here(waiting());

  /** The model the screen's session runs, or a new session would. */
  const runs = () => here(shown());

  /** The waiting pick, else the model that runs. */
  const line = (): ModelChoice | undefined => waitingHere() ?? runs();

  const listingOf = (model: ModelId) => listings().find((listing) => listing.id === model);

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
    Effect.flatMap(choices, (client) => client["model-choice/session"]({ session: screen })).pipe(
      Effect.scoped,
      Effect.option,
      Effect.map((choice) => setShown({ screen, value: Option.getOrUndefined(choice) })),
    );

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
