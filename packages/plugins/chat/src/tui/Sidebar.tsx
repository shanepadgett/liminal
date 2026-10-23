/**
 * Chat's own sidebar section: where the session runs, and how much of the model's context window
 * the latest call used.
 */

import { Effect, Option, Stream } from "effect";
import { type Accessor, createEffect, createSignal, on, Show } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { DirectoriesRpc, type Workspace } from "@shanepadgett/liminal-directories/contract";
import { type ModelId, ModelRpc } from "@shanepadgett/liminal-model/contract";
import { kit, useColor, useRun, useWatch } from "@shanepadgett/liminal-tui";

import { contextUsed, stepModel } from "../view/index.ts";
import type { SidebarProps } from "./slots.ts";

/** Share of the context window past which the percentage turns to the warning color. */
const NEAR_LIMIT = 0.8;

/** Asked once, when the section first draws. */
const workspace = Effect.gen(function* () {
  const client = yield* (yield* Host).client(DirectoriesRpc);

  return yield* client["directories/workspace"]();
}).pipe(Effect.scoped, Effect.asSome, Stream.fromEffect);

/** The model's context window; none when its provider is gone or the catalog does not say. */
const windowOf = (model: ModelId) =>
  Effect.gen(function* () {
    const client = yield* (yield* Host).client(ModelRpc);
    const listing = yield* client["model/details"]({ model });

    return listing.contextWindow;
  }).pipe(
    Effect.scoped,
    Effect.orElseSucceed(() => {}),
  );

/** The context window of `model`, asked again each time it changes. */
const useWindow = (model: Accessor<ModelId | undefined>) => {
  const run = useRun();
  const [known, setKnown] = createSignal<{ readonly model: ModelId; readonly size?: number }>();

  createEffect(
    on(model, (id) => {
      if (id === undefined) return;

      run(
        Effect.map(windowOf(id), (size) =>
          setKnown(size === undefined ? { model: id } : { model: id, size }),
        ),
      );
    }),
  );

  return () => {
    const now = known();

    return now !== undefined && now.model === model() ? now.size : undefined;
  };
};

const shareOf = (used: number | undefined, window: number | undefined) =>
  used === undefined || window === undefined || window === 0
    ? undefined
    : Math.min(1, used / window);

export function SessionSection(props: SidebarProps) {
  const color = useColor();
  const place = useWatch(workspace, Option.none<Workspace>());
  const window = useWindow(() => stepModel(props.state));
  const share = () => shareOf(contextUsed(props.state), window());

  const note = () => {
    const now = share();

    return now === undefined ? undefined : `${Math.round(now * 100)}%`;
  };

  return (
    <kit.Section
      title="Session"
      note={note()}
      noteRole={(share() ?? 0) > NEAR_LIMIT ? "feedback.warning" : "text.muted"}
    >
      <Show when={Option.getOrUndefined(place())}>
        {(found) => (
          <>
            <text wrapMode="none" fg={color("text.base")}>
              {found().folder}
            </text>
            <Show when={found().branch}>
              {(branch) => (
                <text wrapMode="none" fg={color("text.muted")}>
                  {branch()}
                </text>
              )}
            </Show>
          </>
        )}
      </Show>
    </kit.Section>
  );
}
