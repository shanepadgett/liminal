/**
 * Chat's own sidebar section: where the session runs, and how much of the model's context window
 * the latest call used.
 */

import { Effect, Option, Stream } from "effect";
import { Show } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { DirectoriesRpc, type Workspace } from "@shanepadgett/liminal-directories/contract";
import { ModelRpc, type RoleModel } from "@shanepadgett/liminal-model/contract";
import { kit, useColor, useWatch } from "@shanepadgett/liminal-tui";

import { contextUsed } from "../view/index.ts";
import type { SidebarProps } from "./slots.ts";

/** Share of the context window past which the percentage turns to the warning color. */
const NEAR_LIMIT = 0.8;

/** Asked once, when the section first draws. */
const workspace = Effect.gen(function* () {
  const client = yield* (yield* Host).client(DirectoriesRpc);

  return yield* client["directories/workspace"]();
}).pipe(Effect.scoped, Effect.asSome, Stream.fromEffect);

/** The main model, or nothing while no provider is connected; no share shows without it. */
const mainModel = Effect.gen(function* () {
  const client = yield* (yield* Host).client(ModelRpc);

  return yield* client["model/main"]();
}).pipe(Effect.scoped, Effect.option, Stream.fromEffect);

const shareOf = (used: number | undefined, model: Option.Option<RoleModel>) => {
  const window = Option.getOrUndefined(model)?.contextWindow;

  return used === undefined || window === undefined || window === 0
    ? undefined
    : Math.min(1, used / window);
};

export function SessionSection(props: SidebarProps) {
  const color = useColor();
  const place = useWatch(workspace, Option.none<Workspace>());
  const model = useWatch(mainModel, Option.none<RoleModel>());
  const share = () => shareOf(contextUsed(props.state), model());

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
