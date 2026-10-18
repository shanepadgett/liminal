/**
 * The terminal's commands: a part's commands stay while its Scope is open, run with the text typed
 * after their slash name, and are found by slash name or alias.
 */

import { expect } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { Effect, Exit, Layer, Scope } from "effect";

import { effectTest } from "@liminal/sdk/testing";
import { type Command, slashCommand } from "@liminal/sdk/tui";

import { makeTerminal } from "../src/tui/run.tsx";

const terminal = Effect.acquireRelease(
  Effect.promise(() => createTestRenderer({ width: 40, height: 10 })),
  ({ renderer }) =>
    Effect.sync(() => {
      renderer.destroy();
    }),
).pipe(Effect.flatMap(({ renderer }) => makeTerminal(renderer)));

const greet = (got: Array<string>): Command => ({
  name: "test.greet",
  title: "Greet",
  slash: { name: "greet", aliases: ["hi"], arguments: true },
  run: (args) => {
    got.push(args);
  },
});

effectTest(
  "a command is listed until its part's Scope closes",
  Effect.gen(function* () {
    const { commands } = yield* terminal;
    const part = yield* Scope.make();

    yield* commands
      .register([greet([])], [{ key: "ctrl+g", cmd: "test.greet" }])
      .pipe(Scope.provide(part));

    const listed = commands.listed().find(({ command }) => command.name === "test.greet");
    expect(listed?.keys).toBe("ctrl+g");

    yield* Scope.close(part, Exit.void);

    expect(commands.listed().map(({ command }) => command.name)).not.toContain("test.greet");
  }),
  Layer.empty,
);

effectTest(
  "a command found by its alias runs with the typed arguments",
  Effect.gen(function* () {
    const { commands } = yield* terminal;
    const got: Array<string> = [];

    yield* commands.register([greet(got)]);

    const command = slashCommand(commands.listed(), "hi");
    expect(command?.name).toBe("test.greet");
    commands.run("test.greet", "there");
    expect(got).toEqual(["there"]);
  }),
  Layer.empty,
);
