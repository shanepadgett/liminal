import assert from "node:assert/strict";
import { test } from "node:test";

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

void test("lock sources read package pins and mise sources read tool pins", () => {
  assert.equal(pinnedVersion(source("effect", "lock"), pins), "4.0.5");
  assert.equal(pinnedVersion(source("bun", "mise"), pins), "1.4.3");
  assert.equal(pinnedVersion(source("bun", "lock"), pins), undefined);
});

void test("every package and tool needs a reference", () => {
  assert.deepEqual(pinnedNames(pins), ["effect", "bun"]);
});

void test("editing a source changes its fingerprint", () => {
  const before = fingerprint(source("effect", "lock"));
  assert.notEqual(before, fingerprint({ ...source("effect", "lock"), summary: "changed" }));
  assert.equal(before, fingerprint(source("effect", "lock")));
});
