#!/usr/bin/env bun
/** The `liminal` command: print mode with `-p`, `liminal connect`, and help otherwise. */
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Option, Stdio, Stream } from "effect";
import { CliError, Command, Flag } from "effect/cli";

import { host } from "./composition.ts";
import { connect } from "./connect.ts";
import { print } from "./print.ts";

/** Piped stdin, or nothing when stdin is the terminal. */
const piped = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  if (yield* stdio.stdinIsTerminal) return Option.none<string>();

  const text = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString);

  return Option.some(text.trim()).pipe(Option.filter((value) => value.length > 0));
});

/** The prompt from `-p`, with piped stdin after it. */
const promptOf = Effect.fn("promptOf")(function* (flag: string) {
  const stdin = yield* piped;

  return Option.match(stdin, { onNone: () => flag, onSome: (text) => `${flag}\n\n${text}` });
});

const connectCommand = Command.make("connect", {}, () =>
  Effect.scoped(connect).pipe(
    Effect.catchTag("LoginFailed", (error) => Console.error(error.message)),
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the connect command's entry point.
    Effect.provide(host),
  ),
).pipe(Command.withDescription("Sign in to a model provider"));

const liminal = Command.make(
  "liminal",
  {
    print: Flag.String("print").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("Send the prompt to a new session and print the reply"),
      Flag.optional,
    ),
  },
  Effect.fn(function* ({ print: flag }) {
    if (Option.isNone(flag)) {
      return yield* new CliError.ShowHelp({ commandPath: ["liminal"], errors: [] });
    }

    const prompt = yield* promptOf(flag.value);

    // The plugins start only for print mode, so help never opens the session store.
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- print mode's entry point.
    return yield* Effect.scoped(print(prompt)).pipe(Effect.provide(host));
  }),
).pipe(
  Command.withDescription("An agent harness where everything is a plugin"),
  Command.withSubcommands([connectCommand]),
);

liminal.pipe(
  Command.run({ version: "0.1.0" }),
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the program's entry point.
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
