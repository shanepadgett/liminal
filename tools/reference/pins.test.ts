import { expect, test } from "bun:test";

import { fingerprint, type Source } from "./manifest.ts";
import { pinnedNames, pinnedVersion, type Pins } from "./pins.ts";

const pins: Pins = {
  packages: new Map([["effect", { version: "4.0.5", workspace: "apps/cli" }]]),
  tools: new Map([["bun", "1.4.3"]]),
};

const source = (name: string, versionSource: Source["versionSource"]): Source => ({
  package: name,
  versionSource,
  summary: "",
  docs: [],
  api: [],
});

test("lock sources read package pins and mise sources read tool pins", () => {
  expect(pinnedVersion(source("effect", "lock"), pins)).toBe("4.0.5");
  expect(pinnedVersion(source("bun", "mise"), pins)).toBe("1.4.3");
  expect(pinnedVersion(source("bun", "lock"), pins)).toBe(undefined);
});

test("every package and tool needs a reference", () => {
  expect(pinnedNames(pins)).toEqual(["effect", "bun"]);
});

test("editing a source changes its fingerprint", () => {
  const before = fingerprint(source("effect", "lock"));
  expect(before).not.toBe(fingerprint({ ...source("effect", "lock"), summary: "changed" }));
  expect(before).toBe(fingerprint(source("effect", "lock")));
});
