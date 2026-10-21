import { describe, expect, it } from "bun:test";

import { wordingOf } from "./wording.ts";
import { groupsOf } from "./workGroups.ts";

describe("wordingOf", () => {
  it("names reads and searches in a row as one exploration of the folder they share", () => {
    const [explored] = groupsOf([
      { kind: "action", action: { kind: "read", path: "kernel/src/host.ts" } },
      { kind: "action", action: { kind: "read", path: "kernel/test/host.test.ts" } },
      { kind: "action", action: { kind: "search", pattern: "boot", hits: 3 } },
    ]);

    expect(explored && wordingOf(explored)).toMatchObject({
      label: "Explore",
      subject: "kernel, 2 files, 1 search",
    });
  });

  it("says a failed command failed, and nothing more when it passed", () => {
    const [failed, passed] = groupsOf([
      {
        kind: "action",
        action: { kind: "run", command: "bun test", output: [], hasPassed: false },
      },
      { kind: "action", action: { kind: "run", command: "bun test", output: [], hasPassed: true } },
    ]);

    expect(failed && wordingOf(failed).failure).toBe("failed");
    expect(passed && wordingOf(passed).failure).toBe("");
  });
});
