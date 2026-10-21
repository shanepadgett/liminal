/** The `/model` listing: providers not signed in are left out, failed lists come last. */

import { expect, test } from "bun:test";

import { Effect } from "effect";

import { ModelError, type ProviderInfo } from "@liminal/sdk";

import { listAll, modelOptions } from "../src/tui/models.ts";

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

const model = (id: string) => ({
  id,
  name: id.toUpperCase(),
  contextWindow: 1,
  maxOutput: 1,
  thinking: [],
  input: ["text" as const],
});

test("favorites come first, with their provider's name, and leave their provider's section", () => {
  const options = modelOptions(
    [
      { provider: { id: "a", name: "Alpha" }, models: [model("a1"), model("a2")] },
      { provider: { id: "b", name: "Beta" }, models: [model("b1")] },
    ],
    { favorites: new Set(["b/b1", "a/a2"]), defaultKey: "a/a1" },
  );

  expect(options.map((one) => [one.value, one.category, one.description])).toEqual([
    ["a/a2", "Favorites", "Alpha · a2"],
    ["b/b1", "Favorites", "Beta · b1"],
    ["a/a1", "Alpha", "a1"],
  ]);

  expect(options.flatMap((one) => (one.tag === "default" ? [one.value] : []))).toEqual(["a/a1"]);
});
