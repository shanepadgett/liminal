/** Which of the command-line tools the model is told about are on `PATH`. */
import { Effect } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";

const KNOWN_TOOLS = ["rg", "fd", "jq", "git", "gh", "bun", "node", "python3"];

/** The known tools `bash` finds, in the known order; none when it cannot look. */
export const installedTools = (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  spawner
    .lines(
      // `command -v` fails when any tool is missing; the found ones are still printed.
      ChildProcess.make("bash", ["-c", `command -v ${KNOWN_TOOLS.join(" ")}; exit 0`], {
        stdin: "ignore",
        stderr: "ignore",
      }),
    )
    .pipe(
      Effect.map((paths) =>
        KNOWN_TOOLS.filter((tool) => paths.some((found) => found.endsWith(`/${tool}`))),
      ),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );
