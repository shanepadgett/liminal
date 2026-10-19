/** References: names from URLs, git's progress, a clone of a local repository, attaching and tags. */

import { expect, test } from "bun:test";

import { Context as EffectContext, Effect, Layer, Option, Path, FileSystem, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { RpcTest } from "effect/rpc";

import context from "@liminal/context";
import { Context } from "@liminal/context/contract";
import { Directories, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import references from "../plugin.ts";
import { CloneProgress, referenceNameOf, ReferencesRpcs } from "../src/contract.ts";
import { progressOf } from "../src/server/clone.ts";
import { readmeLine } from "../src/server/description.ts";
import { makeReferenceTags } from "../src/server/tags.ts";

const stack = serverOf(references).pipe(
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const s1 = SessionId.make("s1");

test("a reference is named by the URL's last part", () => {
  expect(referenceNameOf("https://github.com/sst/opencode.git")).toBe("opencode");
  expect(referenceNameOf("git@github.com:charmbracelet/glow.git")).toBe("glow");
  expect(referenceNameOf("https://github.com/owner/repo/?tab=readme")).toBe("repo");
  expect(referenceNameOf("   ")).toBe("");
});

test("git's progress lines become steps", () => {
  expect(progressOf("Receiving objects:  37% (370/1000)")).toEqual(
    Option.some(CloneProgress.make({ phase: "receiving", percent: 37 })),
  );

  expect(Option.isNone(progressOf("Cloning into 'repo'..."))).toBe(true);
});

test("a README's first prose line describes the clone", () => {
  expect(
    readmeLine("# Title\n\n![badge](x)\n\nA [fast](https://x) *tool* for `git`.\n\nMore."),
  ).toEqual(Option.some("A fast tool for git."));

  expect(Option.isNone(readmeLine("# Only a title\n"))).toBe(true);
});

/** A git repository at `<workspace>/sample` with one commit holding a README and `src/a.ts`. */
const sample = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = path.join((yield* Directories).workspace, "sample");

  yield* fs.makeDirectory(path.join(root, "src"), { recursive: true });
  yield* fs.writeFileString(path.join(root, "README.md"), "# Sample\n\nA sample library.\n");
  yield* fs.writeFileString(path.join(root, "src/a.ts"), "");

  const git = (...args: ReadonlyArray<string>) =>
    spawner.string(
      ChildProcess.make("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
        cwd: root,
      }),
    );

  yield* git("init", "-q", "-b", "main");
  yield* git("add", ".");
  yield* git("commit", "-q", "-m", "first");

  return root;
});

effectTest(
  "a clone is listed with its README line, attached, told to the model and tagged",
  Effect.gen(function* () {
    const url = yield* sample;
    const services = yield* Layer.build(stack);
    const client = yield* RpcTest.makeClient(ReferencesRpcs).pipe(Effect.provide(services));

    yield* Stream.runDrain(client["references/clone"]({ url }));

    const listed = yield* client["references/list"]();

    expect(listed).toMatchObject([
      { name: "sample", branch: "main", description: "A sample library." },
    ]);

    yield* client["references/attach"]({ session: s1, names: ["sample"] });
    const attached = yield* Stream.runHead(client["references/attached"]({ session: s1 }));
    expect(attached).toEqual(Option.some(["sample"]));

    const request = yield* EffectContext.get(services, Context).build(s1, {
      provider: "scripted",
      id: "scripted",
    });

    const text = JSON.stringify(request.messages);
    expect(text).toContain("- sample");

    const { data, home } = yield* Directories;
    const path = yield* Path.Path;

    const tags = makeReferenceTags({
      path,
      spawner: yield* ChildProcessSpawner.ChildProcessSpawner,
      folder: path.join(data, "references"),
      home,
      names: Effect.succeed(["sample"]),
    });

    const clones = yield* tags.find("sam");
    expect(clones.map((row) => row.kind)).toEqual(["reference"]);

    const files = yield* tags.find(`${clones[0]?.tag ?? ""}src`);
    expect(files.map((row) => row.path)).toEqual(["sample/src/", "sample/src/a.ts"]);

    yield* client["references/remove"]({ name: "sample" });
    expect(yield* client["references/list"]()).toEqual([]);

    const entries = yield* EffectContext.get(services, SessionLog).read(s1, {});
    expect(entries.length).toBeGreaterThan(0);
  }),
  testBaseServices,
);
