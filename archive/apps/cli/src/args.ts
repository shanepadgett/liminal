/**
 * The command line: `liminal [--session <id>] [--model <provider/model>]` opens the TUI; `liminal
 * -p <prompt>` runs one prompt and prints the reply; `--check` only boots the kernel.
 */

import { Console, Data, Effect, Option, Ref, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

import { type ModelRef, SessionId } from "@liminal/sdk";

import pkg from "../package.json" with { type: "json" };

/** What the command line asks for. */
export type Launch = Data.TaggedEnum<{
  Check: {};
  Print: {
    readonly prompt: string;
    readonly session: Option.Option<SessionId>;
    readonly model: Option.Option<ModelRef>;
  };
  Tui: { readonly session: Option.Option<SessionId>; readonly model: Option.Option<ModelRef> };
}>;

export const Launch = Data.taggedEnum<Launch>();

/** The flags do not fit together, such as a prompt without `--print`. */
class LaunchInvalid extends Schema.TaggedError<LaunchInvalid, { readonly brand: unique symbol }>()(
  "LaunchInvalid",
  { message: Schema.String },
) {}

/** The exit code for a command line that does not parse or fit together. */
const invalidExitCode = 2;

/** `provider/model`, split at the first slash; the model id may hold more. */
export const parseModel = (text: string): Option.Option<ModelRef> => {
  const slash = text.indexOf("/");
  if (slash <= 0 || slash === text.length - 1) return Option.none();

  return Option.some({ provider: text.slice(0, slash), id: text.slice(slash + 1) });
};

const flags = {
  prompt: Argument.String("prompt").pipe(
    Argument.withDescription("The prompt to run; needs --print"),
    Argument.optional,
  ),
  print: Flag.Boolean("print").pipe(
    Flag.withAlias("p"),
    Flag.withDescription("Run the prompt, print the reply and exit"),
    Flag.withDefault(false),
  ),
  session: Flag.String("session").pipe(
    Flag.withDescription("The session to open or continue"),
    Flag.map((text) => SessionId.make(text)),
    Flag.optional,
  ),
  model: Flag.String("model").pipe(
    Flag.withDescription("The model for this run, as provider/model"),
    Flag.filterMap(parseModel, (text) => `Expected provider/model, got "${text}"`),
    Flag.optional,
  ),
  check: Flag.Boolean("check").pipe(
    Flag.withDescription("Only check that the app boots"),
    Flag.withDefault(false),
  ),
};

type Parsed = Command.Command.Config.Infer<typeof flags>;

/** The launch the flags ask for, or why they don't fit together. */
const launchOf = (parsed: Parsed): Effect.Effect<Launch, LaunchInvalid> => {
  if (parsed.check) return Effect.succeed(Launch.Check());
  const { session, model } = parsed;

  if (parsed.print) {
    return Option.match(parsed.prompt, {
      onNone: () => Effect.fail(new LaunchInvalid({ message: "--print needs a prompt" })),
      onSome: (prompt) => Effect.succeed(Launch.Print({ prompt, session, model })),
    });
  }

  if (Option.isSome(parsed.prompt)) {
    return Effect.fail(new LaunchInvalid({ message: "A prompt needs --print" }));
  }

  return Effect.succeed(Launch.Tui({ session, model }));
};

/** Prints why the launch is invalid and gives its exit code. */
const invalid = (error: LaunchInvalid) => Effect.as(Console.error(error.message), invalidExitCode);

/**
 * Parses `args` and runs the launch they ask for, returning its exit code. Help and version print
 * and exit 0; flags that do not parse or fit together print why and exit 2.
 */
export const runArgs = Effect.fn("runArgs")(function* <E, R>(
  args: ReadonlyArray<string>,
  run: (launch: Launch) => Effect.Effect<number, E, R>,
) {
  const code = yield* Ref.make(0);

  const command = Command.make("liminal", flags, (parsed) =>
    Effect.matchEffect(launchOf(parsed), { onFailure: invalid, onSuccess: run }).pipe(
      Effect.flatMap((exit) => Ref.set(code, exit)),
    ),
  ).pipe(Command.withDescription("A coding agent in the terminal"));

  // The command line's own errors are already printed with the help.
  yield* Command.runWith(command, { version: pkg.version })(args).pipe(
    Effect.catchIf(CliError.isCliError, () => Ref.set(code, invalidExitCode)),
  );

  return yield* Ref.get(code);
});
