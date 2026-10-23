#!/usr/bin/env bun
/**
 * The `liminal` command: print mode with `-p`, `liminal connect`, `liminal logout`, and the TUI
 * otherwise.
 */
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Option, Stdio, Stream, Terminal } from "effect";
import { Command, Flag } from "effect/cli";

import { host } from "./composition.ts";
import { connect } from "./connect.ts";
import { badUsage, ExitCode, failed, interrupted } from "./exit-code.ts";
import { logout } from "./logout.ts";
import { print } from "./print.ts";
import { tui } from "./tui.ts";

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

/** An interactive subcommand: quitting its prompt exits 130, and any other failure prints and exits 1. */
const interactive = <A, E extends { readonly message: string }, R>(
  name: string,
  description: string,
  run: Effect.Effect<A, E | Terminal.QuitError, R>,
) =>
  Command.make(name, {}, () =>
    Effect.scoped(run).pipe(
      Effect.catchTag("QuitError", () => new ExitCode({ code: interrupted })),
      Effect.catch((error) =>
        Effect.andThen(Console.error(error.message), new ExitCode({ code: failed })),
      ),
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the subcommand's entry point.
      Effect.provide(host),
    ),
  ).pipe(Command.withDescription(description));

const connectCommand = interactive("connect", "Sign in to a model provider", connect);

const logoutCommand = interactive("logout", "Log out of a connected model provider", logout);

const liminal = Command.make(
  "liminal",
  {
    print: Flag.String("print").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("Send the prompt to a new session and print the reply"),
      Flag.optional,
    ),
    json: Flag.Boolean("json").pipe(
      Flag.withDescription("With -p, write every saved event and delta as a JSON line"),
      Flag.withDefault(false),
    ),
    model: Flag.String("model").pipe(
      Flag.withDescription("With -p, run this model, such as anthropic/claude-sonnet-4-5"),
      Flag.optional,
    ),
  },
  Effect.fn(function* ({ print: flag, json, model }) {
    if (Option.isNone(flag)) {
      return yield* tui.pipe(
        Effect.catch((error) =>
          Effect.andThen(Console.error(error.message), new ExitCode({ code: failed })),
        ),
      );
    }

    const prompt = yield* promptOf(flag.value);

    // The plugins start only once the command is known, so help never opens the session store.
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- print mode's entry point.
    return yield* Effect.scoped(print(prompt, json, model)).pipe(Effect.provide(host));
  }),
).pipe(
  Command.withDescription("An agent harness where everything is a plugin"),
  Command.withSubcommands([connectCommand, logoutCommand]),
);

liminal.pipe(
  Command.run({ version: "0.1.0" }),
  Effect.catchTag("ShowHelp", (help) =>
    help.errors.length > 0 ? new ExitCode({ code: badUsage }) : Effect.void,
  ),
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the program's entry point.
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
