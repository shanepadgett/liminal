/** Notices' server: registers the notice entry kind, so notices read back decoded. */

import { Effect, Layer } from "effect";

import { EntryKinds } from "@liminal/session-log/contract";

import { NoticeEntry } from "./contract.ts";

export const layer = Layer.effectDiscard(
  Effect.flatMap(EntryKinds, (kinds) => kinds.register(NoticeEntry)),
);
