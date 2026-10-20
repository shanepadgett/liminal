/** Opt-in entry-data audit; loads contracts without starting the kernel or its session store. */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect } from "effect";

import { loadEntryDefinitions } from "./audit/definitions.ts";
import { auditHistory, formatHistoryAudit } from "./audit/history.ts";
import { exitWithCode } from "./supervisor.ts";

const audit = Effect.gen(function* () {
  const filename = process.argv[2];

  if (process.argv.length !== 3 || filename === undefined || filename === "") {
    yield* Console.error("Usage: bun apps/cli/src/audit-history.ts <sessions.db>");

    return 2;
  }

  const definitions = yield* loadEntryDefinitions;
  const report = yield* auditHistory(filename, definitions);
  yield* Console.log(formatHistoryAudit(report));

  return report.mismatches.length > 0 || report.unknownKinds.length > 0 ? 1 : 0;
}).pipe(Effect.catch((error) => Effect.as(Console.error(error.message), 2)));

if (import.meta.main) {
  BunRuntime.runMain(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the audit's standalone entry point.
    audit.pipe(Effect.provide(BunServices.layer)),
    { teardown: exitWithCode },
  );
}
