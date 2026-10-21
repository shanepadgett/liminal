/**
 * Skills' TUI part: one `/<name>` command per skill found when the part starts, skipping a name
 * another command has. Running one sends the skill with the text typed after its name.
 */

import { Effect, Predicate } from "effect";
import { createSignal, onCleanup } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  type Command,
  defineTui,
  makeBridge,
  TuiCommands,
  TuiHost,
  TuiToasts,
} from "@liminal/sdk/tui";

import { type SkillSummary, SkillsRpcs } from "./contract.ts";

/** After commit's line; draws nothing. */
const LINE_ORDER = 50;

const NONE: ReadonlyArray<SkillSummary> = [];

/** A command for each skill whose name no other command's slash name has. */
const commandsOf = (
  skills: ReadonlyArray<SkillSummary>,
  taken: ReadonlySet<string>,
  use: (name: string, args: string) => void,
): ReadonlyArray<Command> =>
  skills.flatMap((skill) =>
    taken.has(skill.name)
      ? []
      : [
          {
            name: `skills.${skill.name}`,
            title: skill.name,
            desc: skill.description,
            category: "Skills",
            slash: { name: skill.name, arguments: true },
            palette: true,
            run: (args: string) => {
              use(skill.name, args);
            },
          },
        ],
  );

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const toasts = yield* TuiToasts;
    const client = yield* host.client(SkillsRpcs);
    const bridge = yield* makeBridge;
    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();
    const commands = yield* TuiCommands;

    const use = (name: string, args: string) => {
      const session = onScreen();
      if (session === undefined) return;

      bridge.run(
        client["skills/use"]({ session, name, args }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              toasts.show({
                kind: "error",
                title: `/${name}`,
                message: Predicate.isTagged(error, "UnknownSkill")
                  ? "This skill is gone. Reload to update the skill commands."
                  : error.message,
              });
            }),
          ),
        ),
      );
    };

    // The list arrives after the part starts, so the screen does not wait for it.
    yield* client["skills/list"]().pipe(
      Effect.orElseSucceed(() => NONE),
      Effect.flatMap((skills) => {
        const taken = new Set(
          commands.listed().flatMap(({ command }) => (command.slash ? [command.slash.name] : [])),
        );

        return commands.register(commandsOf(skills, taken, use));
      }),
      Effect.forkScoped,
    );

    yield* host.register(
      ChatSlots.composerLine,
      { id: "skills", order: LINE_ORDER },
      function OnScreen(props: { readonly sessionId: SessionId }) {
        setOnScreen(props.sessionId);

        onCleanup(() => {
          setOnScreen();
        });

        return null;
      },
    );
  }),
});
