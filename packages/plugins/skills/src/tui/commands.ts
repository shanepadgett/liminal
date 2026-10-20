/** Refreshable slash-only commands share the existing command registry and collision policy. */

import { Effect, Predicate, ScopedRef, Semaphore } from "effect";

import type { SessionId } from "@liminal/sdk";
import { type Command, makeBridge, TuiCommands, TuiHost, TuiToasts } from "@liminal/sdk/tui";

import { type SkillSummary, SkillsRpcs } from "../contract.ts";

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
            run: (args: string) => {
              use(skill.name, args);
            },
          },
        ],
  );

export const makeSkillCommands = Effect.fn("skills.makeCommands")(function* (
  onScreen: () => SessionId | undefined,
) {
  const host = yield* TuiHost;
  const client = yield* host.client(SkillsRpcs);
  const commands = yield* TuiCommands;
  const toasts = yield* TuiToasts;
  const bridge = yield* makeBridge;
  const registered = yield* ScopedRef.make(() => {});
  const lock = yield* Semaphore.make(1);

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
                ? "This skill is gone. Open Manage skills and refresh the list."
                : error.message,
            });
          }),
        ),
      ),
    );
  };

  const refreshCommands = lock.withPermit(
    Effect.gen(function* () {
      const skills = yield* client["skills/list"]();

      const taken = new Set(
        commands
          .listed()
          .flatMap(({ command }) =>
            !command.name.startsWith("skills.") && command.slash
              ? [command.slash.name].concat(command.slash.aliases ?? [])
              : [],
          ),
      );

      yield* ScopedRef.set(registered, commands.register(commandsOf(skills, taken, use)));
    }),
  );

  return { refresh: refreshCommands };
});
