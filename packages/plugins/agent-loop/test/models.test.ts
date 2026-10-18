/** The `/model` listing: providers not signed in are left out, failed lists come last. */

import { expect, test } from "bun:test";

import { Effect } from "effect";

import { ModelError, type ProviderInfo } from "@liminal/sdk";

import { listAll } from "../src/tui/models.ts";

const providers: ReadonlyArray<ProviderInfo> = [
  { id: "broken", name: "Broken" },
  { id: "signed-out", name: "Signed out" },
  { id: "listed", name: "Listed" },
];

const list = (provider: ProviderInfo) => {
  if (provider.id === "signed-out")
    return Effect.fail(ModelError.make({ reason: "auth", message: "No API key" }));

  if (provider.id === "broken")
    return Effect.fail(ModelError.make({ reason: "network", message: "Catalog is down" }));

  return Effect.succeed([]);
};

test("a provider not signed in is left out and a failed one comes last", async () => {
  const listed = await Effect.runPromise(listAll(Effect.succeed(providers), list));

  expect(listed.map((one) => [one.provider.id, one.failure])).toEqual([
    ["listed", undefined],
    ["broken", "Catalog is down"],
  ]);
});
