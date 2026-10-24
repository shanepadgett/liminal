/** Chat's own sidebar section: where the session runs. */

import { Effect, Option, Stream } from "effect";
import { Show } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { DirectoriesRpc, type Workspace } from "@shanepadgett/liminal-directories/contract";
import { kit, useColor, useWatch } from "@shanepadgett/liminal-tui";

/** Asked once, when the section first draws. */
const workspace = Effect.gen(function* () {
  const client = yield* (yield* Host).client(DirectoriesRpc);

  return yield* client["directories/workspace"]();
}).pipe(Effect.scoped, Effect.asSome, Stream.fromEffect);

export function SessionSection() {
  const color = useColor();
  const place = useWatch(workspace, Option.none<Workspace>());

  return (
    <kit.Section title="Session">
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
