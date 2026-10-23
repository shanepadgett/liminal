/** Warning notices for problems with the files, each told to a session once per run. */
import { Effect, Ref } from "effect";

import { Notice, type SessionId, type SessionLog } from "@shanepadgett/liminal-session/contract";

export type Tell = (session: SessionId, problems: ReadonlyArray<string>) => Effect.Effect<void>;

export const makeTell = Effect.fn("makeTell")(function* (log: SessionLog["Service"]) {
  const told = yield* Ref.make<ReadonlySet<string>>(new Set());

  const tell: Tell = (session, problems) =>
    Effect.gen(function* () {
      const fresh = yield* Ref.modify(told, (seen) => {
        const unseen = problems.filter((problem) => !seen.has(`${session}:${problem}`));

        return [unseen, new Set([...seen, ...unseen.map((problem) => `${session}:${problem}`)])];
      });

      const [first, ...rest] = yield* Effect.forEach(fresh, (text) =>
        Notice.make({ level: "warning", text }),
      );

      if (first === undefined) return;

      yield* log.append(session, [first, ...rest]);
    }).pipe(
      Effect.catch((error) => Effect.logWarning("Couldn't save an instructions notice", error)),
    );

  return tell;
});
