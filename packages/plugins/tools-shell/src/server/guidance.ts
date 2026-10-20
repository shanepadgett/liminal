/** Detects optional helpers through the same runner and environment as shell calls. */

import { Duration, Effect } from "effect";

import { CommandRunner } from "@liminal/command-runner/contract";
import { Directories } from "@liminal/sdk";

const helpers = [
  {
    name: "rg",
    guidance:
      "`rg`: prefer targeted content searches; narrow by directory and file type. Use -l for filenames, -q for existence, -n for matching lines, and -F for literal text. -m limits matches per file, not total output. Respect ignore rules unless the task requires hidden or ignored files.",
  },
  {
    name: "fd",
    guidance:
      "`fd`: prefer it for filename discovery; constrain the search root, extension, or file type.",
  },
  {
    name: "fdfind",
    guidance:
      "`fdfind`: prefer it for filename discovery; constrain the search root, extension, or file type. This is the installed name of fd.",
  },
  {
    name: "jq",
    guidance:
      "`jq`: select needed fields or records instead of printing whole JSON documents. Use -r for strings and -c for compact JSON.",
  },
];

export const detectGuidance = Effect.fn("Shell.detectGuidance")(function* () {
  const runner = yield* CommandRunner;
  const { workspace } = yield* Directories;

  const command = helpers
    .map(({ name }) => `if command -v ${name} >/dev/null 2>&1; then printf '%s\\n' ${name}; fi`)
    .join("; ");

  const result = yield* runner
    .run({ command, cwd: workspace, timeout: Duration.seconds(2) })
    .pipe(Effect.catchTag("CommandFailed", () => Effect.succeed(null)));

  if (result === null || result.end.type !== "exited" || result.end.code !== 0) return [];

  const available = new Set(result.stdout.trim().split("\n"));

  return helpers.flatMap(({ name, guidance }) => {
    const isPreferred = available.has(name) && (name !== "fdfind" || !available.has("fd"));

    return isPreferred ? [guidance] : [];
  });
});
